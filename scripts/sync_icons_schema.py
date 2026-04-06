#!/usr/bin/env python3
# sync_assets_icons.py — copies object type icons (by name) between JSM Assets Cloud schemas
# Shows exact PUTs & responses with --log-level DEBUG (and full HTTP traces with --trace-http)

import argparse, base64, getpass, sys
from typing import Dict, Any, List, Tuple
from datetime import datetime
import anyio
import httpx
from rich.console import Console
from rich.table import Table

console = Console()

API_TIMEOUT = 30.0
UA = "assets-icon-sync/3.0"
RETRY_BACKOFF = [0, 1, 2, 4, 8]
MAX_BODY_LOG = 2048  # bytes to print from HTTP bodies

# ----- log level control -----
LEVELS = {"DEBUG": 10, "INFO": 20, "WARN": 30, "ERROR": 40}
current_level = LEVELS["INFO"]

def iso_now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"

def log(level: str, msg: str) -> None:
    if LEVELS[level] >= current_level:
        console.print(f"[{iso_now()}] [{level}] {msg}")

def b64_basic(email: str, token: str) -> str:
    return base64.b64encode(f"{email}:{token}".encode()).decode()

def prompt_if_missing(args):
    def need(attr, prompt, secret=False):
        if getattr(args, attr, None):
            return
        val = getpass.getpass(prompt) if secret else input(prompt)
        setattr(args, attr, val.strip())

    need("src_site", "Source site (e.g. source.atlassian.net): ")
    need("src_schema_id", "Source schema ID: ")
    need("src_email", "Source email: ")
    need("src_token", "Source API token: ", secret=True)

    need("dst_site", "Destination site (e.g. dest.atlassian.net): ")
    need("dst_schema_id", "Destination schema ID: ")
    need("dst_email", "Destination email: ")
    need("dst_token", "Destination API token: ", secret=True)
    return args

# ----- optional http tracing via httpx event hooks -----
def make_hooks(enable: bool):
    if not enable:
        return None
    async def on_request(request: httpx.Request):
        # body may be None if not sent
        body = b""
        try:
            body = request.content or b""
        except Exception:
            pass
        bshow = body[:MAX_BODY_LOG]
        log("DEBUG", f"HTTP REQUEST {request.method} {request.url}\n"
                     f"Headers: {{'Content-Type': {request.headers.get('Content-Type')}}}\n"
                     f"Body: {bshow!r}")
    async def on_response(response: httpx.Response):
        try:
            txt = response.text
        except Exception:
            txt = "<non-text body>"
        log("DEBUG", f"HTTP RESPONSE {response.request.method} {response.request.url} -> {response.status_code}\n"
                     f"Body: {txt[:MAX_BODY_LOG]}")
    return {"request": [on_request], "response": [on_response]}

def make_client(email: str, token: str, trace_http: bool) -> httpx.AsyncClient:
    headers = {
        "User-Agent": UA,
        "Authorization": f"Basic {b64_basic(email, token)}",
        "Accept": "application/json",
    }
    hooks = make_hooks(trace_http)
    return httpx.AsyncClient(timeout=API_TIMEOUT, headers=headers, event_hooks=hooks)

async def get_workspace_id(client: httpx.AsyncClient, site: str) -> str:
    url = f"https://{site}/rest/servicedeskapi/assets/workspace"
    r = await client.get(url)
    r.raise_for_status()
    data = r.json()
    vals = data.get("values") if isinstance(data, dict) else data
    if not vals:
        raise RuntimeError(f"No Assets workspace found on site {site}")
    return vals[0]["workspaceId"]

async def list_object_types_flat(client: httpx.AsyncClient, workspace_id: str, schema_id: str) -> List[Dict[str, Any]]:
    base = f"https://api.atlassian.com/jsm/assets/workspace/{workspace_id}/v1"
    url = f"{base}/objectschema/{schema_id}/objecttypes/flat"
    r = await client.get(url)
    r.raise_for_status()
    items = r.json() or []
    out = []
    for it in items:
        icon = it.get("icon") or {}
        parent_id = it.get("parentObjectTypeId")
        if not parent_id and isinstance(it.get("parentObjectType"), dict):
            parent_id = it["parentObjectType"].get("id")
        out.append({
            "id": str(it.get("id")),
            "name": it.get("name") or "",
            "iconId": (str(icon.get("id")) if icon.get("id") is not None else None),
            "parentId": (str(parent_id) if parent_id else None),
        })
    return out

def keyify(name: str, ignore_case: bool) -> str:
    return name.lower() if ignore_case else name

async def put_object_type_icon_minimal(client: httpx.AsyncClient, workspace_id: str, type_id: str, icon_id: str) -> Tuple[bool, str, int]:
    """
    Minimal payload:
      PUT /objecttype/{id}  {"iconId":"<id>"}
    """
    base = f"https://api.atlassian.com/jsm/assets/workspace/{workspace_id}/v1"
    url = f"{base}/objecttype/{type_id}"
    payload = {"iconId": str(icon_id)}

    # Explicit request/response logging here (in addition to optional hooks)
    log("DEBUG", f"PUT {url} payload={payload}")

    for backoff in RETRY_BACKOFF:
        if backoff:
            await anyio.sleep(backoff)
        r = await client.put(url, json=payload)

        body_preview = ""
        try:
            body_preview = r.text[:MAX_BODY_LOG]
        except Exception:
            body_preview = "<non-text body>"
        log("DEBUG", f"PUT {url} -> {r.status_code} body={body_preview}")

        if r.status_code in (200, 204):
            return True, "Updated", r.status_code
        if r.status_code in (401, 403):
            return False, f"Auth/permission error: {r.text}", r.status_code
        if r.status_code == 404:
            return False, "Object type not found", r.status_code
        if r.status_code == 429:
            ra = r.headers.get("Retry-After")
            await anyio.sleep(float(ra) if (ra and ra.isdigit()) else 2.0)
            continue
        if 500 <= r.status_code < 600:
            continue
        return False, f"Failed ({r.status_code}): {r.text}", r.status_code
    return False, "Failed after retries", 0

async def sync_icons(args) -> int:
    args = prompt_if_missing(args)
    if args.fail_fast:
        args.continue_on_error = False

    async with make_client(args.src_email, args.src_token, args.trace_http) as src_client, \
               make_client(args.dst_email, args.dst_token, args.trace_http) as dst_client:

        if current_level <= LEVELS["DEBUG"]:
            log("DEBUG", "==== DEBUG LOGGING ENABLED ====")
            if args.trace_http:
                log("DEBUG", "HTTP TRACE: request/response bodies (truncated) will be printed")

        log("INFO", f"Discovering source workspace on {args.src_site} …")
        src_ws = await get_workspace_id(src_client, args.src_site)
        log("INFO", f"Source workspaceId={src_ws}")

        log("INFO", f"Discovering destination workspace on {args.dst_site} …")
        dst_ws = await get_workspace_id(dst_client, args.dst_site)
        log("INFO", f"Destination workspaceId={dst_ws}")

        log("INFO", f"Listing source object types (schema {args.src_schema_id}) …")
        src_types = await list_object_types_flat(src_client, src_ws, str(args.src_schema_id))

        log("INFO", f"Listing destination object types (schema {args.dst_schema_id}) …")
        dst_types = await list_object_types_flat(dst_client, dst_ws, str(args.dst_schema_id))

        s_map: Dict[str, Dict[str, Any]] = {keyify(t["name"], args.ignore_case): t for t in src_types}
        d_map: Dict[str, Dict[str, Any]] = {keyify(t["name"], args.ignore_case): t for t in dst_types}

        plan_rows = []
        tasks: List[Tuple[Dict[str, Any], str]] = []  # (dst_type, new_icon_id)

        for key, s in s_map.items():
            d = d_map.get(key)
            if not d:
                plan_rows.append(("MISSING_DST", s["name"], s["iconId"], "-", "-"))
                continue
            src_icon = s["iconId"]
            dst_icon = d["iconId"]
            if not src_icon:
                plan_rows.append(("SKIP_NO_SRC_ICON", s["name"], "None", d["id"], dst_icon or "None"))
                continue
            action = "SKIP" if (src_icon == dst_icon and not args.force) else "UPDATE"
            plan_rows.append((action, s["name"], src_icon, d["id"], dst_icon or "None"))
            if action == "UPDATE":
                tasks.append((d, src_icon))

        # Show plan
        tab = Table(title="Icon sync plan (source → destination)")
        tab.add_column("Action")
        tab.add_column("Type name")
        tab.add_column("Source iconId")
        tab.add_column("Dest typeId")
        tab.add_column("Current dest iconId")
        for row in plan_rows:
            tab.add_row(*[str(x) for x in row])
        console.print(tab)

        if args.dry_run:
            log("INFO", "Dry run complete; no updates performed.")
            return 0

        # bounded concurrency
        sem = anyio.Semaphore(args.max_workers)
        updated = 0
        errors = 0

        async def worker(dst_t: Dict[str, Any], new_icon_id: str):
            nonlocal updated, errors
            await sem.acquire()
            try:
                log("INFO", f"Updating [{dst_t['id']}] '{dst_t['name']}' icon -> {new_icon_id}")
                ok, msg, code = await put_object_type_icon_minimal(dst_client, dst_ws, dst_t["id"], new_icon_id)
                if ok:
                    updated += 1
                    log("INFO", f"OK: {msg}")
                else:
                    errors += 1
                    log("WARN", f"Failed: {msg}")
                    if args.fail_fast:
                        raise RuntimeError(msg)
            finally:
                sem.release()

        async with anyio.create_task_group() as tg:
            for dst_t, icon_id in tasks:
                tg.start_soon(worker, dst_t, icon_id)

        status = "SUCCESS" if errors == 0 else ("PARTIAL" if updated else "FAILED")
        log("INFO", f"Summary: status={status}, updated={updated}, errors={errors}, planned={len(tasks)}")
        return 0 if (errors == 0 or (updated > 0 and args.continue_on_error)) else 2

# ---------- CLI ----------
def main():
    ap = argparse.ArgumentParser(description="Copy object type icons from source Assets Cloud schema to destination schema (match by name).")
    # source
    ap.add_argument("--src-site")
    ap.add_argument("--src-schema-id")
    ap.add_argument("--src-email")
    ap.add_argument("--src-token")
    # destination
    ap.add_argument("--dst-site")
    ap.add_argument("--dst-schema-id")
    ap.add_argument("--dst-email")
    ap.add_argument("--dst-token")
    # behavior
    ap.add_argument("--ignore-case", action="store_true", help="Match names case-insensitively")
    ap.add_argument("--force", action="store_true", help="Update even when destination already has the same icon id")
    ap.add_argument("--max-workers", type=int, default=12, help="Parallel updates (default 12)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--continue-on-error", action="store_true", default=True)
    ap.add_argument("--fail-fast", action="store_true")
    ap.add_argument("--log-level", default="INFO", choices=list(LEVELS.keys()))
    ap.add_argument("--trace-http", action="store_true", help="Log ALL HTTP requests/responses via httpx hooks")
    args = ap.parse_args()

    global current_level
    current_level = LEVELS[args.log_level]

    if args.fail_fast:
        args.continue_on_error = False

    return anyio.run(sync_icons, args)

if __name__ == "__main__":
    sys.exit(main())