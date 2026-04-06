#!/usr/bin/env python3
import argparse, base64, getpass, sys, time, json, math
from typing import Dict, List, Any, Optional, Set, Tuple
from datetime import datetime
import anyio
import httpx
from rich.console import Console
from rich.table import Table

console = Console()

# ===== Config =====
API_TIMEOUT = 30.0
USER_AGENT = "assets-bulk-ot-delete/2.0"
DEFAULT_MAX_WORKERS = 16
RETRY_BACKOFF = [1, 2, 4, 8]  # seconds

def iso_now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"

def log(level: str, msg: str) -> None:
    console.print(f"[{iso_now()}] [{level}] {msg}")

def b64_basic(email: str, token: str) -> str:
    return base64.b64encode(f"{email}:{token}".encode()).decode()

def ask_if_missing(args):
    if not args.site:
        args.site = input("Site (e.g. yourcompany.atlassian.net): ").strip()
    if not args.schema_id:
        args.schema_id = input("Schema ID: ").strip()
    if not args.email:
        args.email = input("Email: ").strip()
    if not args.api_token:
        args.api_token = getpass.getpass("API token: ").strip()
    return args

def make_client(b64_basic_auth: str) -> httpx.AsyncClient:
    headers = {
        "User-Agent": USER_AGENT,
        "Authorization": f"Basic {b64_basic_auth}",
        "Accept": "application/json",
    }
    return httpx.AsyncClient(timeout=API_TIMEOUT, headers=headers)

async def get_workspace_id(client: httpx.AsyncClient, site: str) -> str:
    # Cloud “list workspaces” on the site’s servicedesk API
    url = f"https://{site}/rest/servicedeskapi/assets/workspace"
    r = await client.get(url)
    r.raise_for_status()
    data = r.json()
    if isinstance(data, dict) and data.get("values"):
        return data["values"][0]["workspaceId"]
    if isinstance(data, list) and data:
        return data[0]["workspaceId"]
    raise RuntimeError("Could not determine workspaceId from response")

async def list_object_types_flat(client: httpx.AsyncClient, workspace_id: str, schema_id: str) -> List[Dict[str, Any]]:
    base = f"https://api.atlassian.com/jsm/assets/workspace/{workspace_id}/v1"
    url = f"{base}/objectschema/{schema_id}/objecttypes/flat"
    r = await client.get(url)
    r.raise_for_status()
    items = r.json() or []
    out = []
    for it in items:
        parent_id = it.get("parentObjectTypeId")
        if not parent_id and isinstance(it.get("parentObjectType"), dict):
            parent_id = it["parentObjectType"].get("id")
        out.append({
            "id": str(it.get("id")),
            "name": it.get("name"),
            "parentId": str(parent_id) if parent_id else None,
        })
    return out

def compute_depths(types: List[Dict[str, Any]]) -> Dict[str, int]:
    by_id = {t["id"]: t for t in types}
    depths: Dict[str, int] = {}

    def depth_of(tid: str) -> int:
        if tid in depths:
            return depths[tid]
        seen: Set[str] = set()
        d = 0
        cur = tid
        while True:
            if cur in seen:  # cycle guard
                break
            seen.add(cur)
            parent = by_id.get(cur, {}).get("parentId")
            if not parent:
                break
            d += 1
            cur = parent
        depths[tid] = d
        return d

    for tid in by_id:
        depth_of(tid)
    return depths

def levels_by_depth(types: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
    depths = compute_depths(types)
    by_depth: Dict[int, List[Dict[str, Any]]] = {}
    for t in types:
        d = depths[t["id"]]
        by_depth.setdefault(d, []).append(t)
    # deepest first
    ordered_depths = sorted(by_depth.keys(), reverse=True)
    return [sorted(by_depth[d], key=lambda x: (x.get("name") or "")) for d in ordered_depths]

async def delete_object_type(client: httpx.AsyncClient, workspace_id: str, type_id: str) -> Tuple[bool, str, int]:
    base = f"https://api.atlassian.com/jsm/assets/workspace/{workspace_id}/v1"
    url = f"{base}/objecttype/{type_id}"

    for attempt, backoff in enumerate([0, *RETRY_BACKOFF], start=1):
        if backoff:
            await anyio.sleep(backoff)
        r = await client.delete(url)
        if r.status_code in (200, 204):
            return True, "Deleted", r.status_code
        if r.status_code == 404:
            return True, "Already gone", r.status_code
        if r.status_code in (401, 403):
            return False, f"Auth/permission error: {r.text}", r.status_code
        if r.status_code in (400, 409):
            return False, f"Blocked by constraint: {r.text}", r.status_code
        if r.status_code == 429:
            # Respect Retry-After if present
            ra = r.headers.get("Retry-After")
            wait_s = float(ra) if (ra and ra.isdigit()) else backoff or 2.0
            await anyio.sleep(wait_s)
            continue
        # other 5xx/4xx → retry if attempts remain
        if attempt < len([0, *RETRY_BACKOFF]):
            continue
        return False, f"Failed ({r.status_code}): {r.text}", r.status_code

    return False, "Unknown failure", 0

async def delete_wave(client: httpx.AsyncClient, workspace_id: str,
                      wave_types: List[Dict[str, Any]], max_workers: int,
                      dry_run: bool, continue_on_error: bool) -> Tuple[int,int]:
    deleted = 0
    errors = 0
    async def worker(t: Dict[str, Any]):
        nonlocal deleted, errors
        name = t.get("name") or ""
        tid = t["id"]
        log("INFO", f"Delete: [{tid}] {name!r}")
        if dry_run:
            return
        ok, msg, code = await delete_object_type(client, workspace_id, tid)
        if ok:
            log("INFO", f"OK [{tid}] {msg}")
            deleted += 1
        else:
            log("WARN", f"FAILED [{tid}] {msg}")
            errors += 1
            if not continue_on_error:
                raise RuntimeError(f"Deletion failed for {tid}: {msg}")

    # bounded concurrency
    sem = anyio.Semaphore(max_workers)
    async with anyio.create_task_group() as tg:
        for t in wave_types:
            await sem.acquire()
            async def run_task(tt=t):
                try:
                    await worker(tt)
                finally:
                    sem.release()
            tg.start_soon(run_task)
    return deleted, errors

async def app(args) -> int:
    args = ask_if_missing(args)
    if args.fail_fast:
        args.continue_on_error = False

    basic = b64_basic(args.email, args.api_token)
    async with make_client(basic) as client:
        log("INFO", f"Discovering workspace for {args.site} …")
        ws = await get_workspace_id(client, args.site)
        log("INFO", f"workspaceId={ws}")

        log("INFO", f"Listing object types in schema {args.schema_id} …")
        types = await list_object_types_flat(client, ws, args.schema_id)
        if not types:
            log("INFO", "Schema has no object types. Nothing to do.")
            return 0

        # Build waves: deepest → root
        waves = levels_by_depth(types)

        # Show plan
        plan = Table(title="Deletion plan (parallel waves: deepest → root)")
        plan.add_column("Wave #")
        plan.add_column("Type ID")
        plan.add_column("Name")
        plan.add_column("Parent ID")
        for w, group in enumerate(waves, start=1):
            for t in group:
                plan.add_row(str(w), t["id"], t.get("name") or "", t.get("parentId") or "—")
        console.print(plan)

        total = sum(len(g) for g in waves)
        log("INFO", f"Total object types: {total}; Max workers: {args.max_workers}; Dry run: {args.dry_run}")

        grand_deleted = 0
        grand_errors = 0

        for w, group in enumerate(waves, start=1):
            log("INFO", f"Wave {w}/{len(waves)}: deleting {len(group)} type(s) …")
            try:
                d, e = await delete_wave(client, ws, group, args.max_workers, args.dry_run, args.continue_on_error)
                grand_deleted += d
                grand_errors += e
                if e and not args.continue_on_error:
                    log("ERROR", f"Stopped at wave {w} due to errors.")
                    break
            except Exception as ex:
                grand_errors += 1
                log("ERROR", f"Wave {w} aborted: {ex}")
                if not args.continue_on_error:
                    break

        status = "SUCCESS" if grand_errors == 0 else ("PARTIAL" if grand_deleted else "FAILED")
        log("INFO", f"Summary: status={status}, deleted={grand_deleted}, errors={grand_errors}, total={total}")
        return 0 if (grand_errors == 0 or (grand_deleted > 0 and args.continue_on_error)) else 2

def main():
    ap = argparse.ArgumentParser(description="FAST delete of ALL Object Types in a JSM Assets Cloud schema (parallel waves).")
    ap.add_argument("--site", help="yourcompany.atlassian.net")
    ap.add_argument("--schema-id", dest="schema_id", help="Assets schema ID")
    ap.add_argument("--email", help="Account email")
    ap.add_argument("--api-token", dest="api_token", help="API token")
    ap.add_argument("--max-workers", type=int, default=DEFAULT_MAX_WORKERS, help=f"Parallel deletions per wave (default {DEFAULT_MAX_WORKERS})")
    ap.add_argument("--dry-run", action="store_true", help="Plan only; no deletions")
    ap.add_argument("--continue-on-error", action="store_true", default=True, help="Keep going on errors (default true)")
    ap.add_argument("--fail-fast", action="store_true", help="Stop on first error (default false)")
    ap.add_argument("--log-level", default="INFO", choices=["DEBUG","INFO","WARN","ERROR"])
    args = ap.parse_args()
    return anyio.run(app, args)

if __name__ == "__main__":
    sys.exit(main())

"""
Example usage:

python fast_delete_assets_object_types.py \
  --site "yourcompany.atlassian.net" \
  --schema-id 27 \
  --email "you@company.com" \
  --api-token "ATLTOKEN..." \
  --max-workers 16 \
  --dry-run

"""
