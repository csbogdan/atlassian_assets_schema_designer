#!/usr/bin/env python3
import argparse, base64, json, os, re, sys, pathlib
from typing import Dict, Any, List, Optional
import httpx
from datetime import datetime

API_TIMEOUT = 30.0
UA = "assets-schema-export/1.0"

def iso_now(): return datetime.utcnow().isoformat(timespec="seconds") + "Z"
def log(level, msg): print(f"[{iso_now()}] [{level}] {msg}")

def b64_basic(email: str, token: str) -> str:
    return base64.b64encode(f"{email}:{token}".encode()).decode()

def norm_filename(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9._-]+", "_", name.strip())
    return s.strip("_") or "icon"

def get_workspace_id(client: httpx.Client, site: str) -> str:
    # List workspaces (site-scoped). Response contains workspaceId. (Assets Cloud) 
    # Docs: /rest/servicedeskapi/assets/workspace (site) → workspaceId, used with api.atlassian.com paths. 
    r = client.get(f"https://{site}/rest/servicedeskapi/assets/workspace")
    r.raise_for_status()
    data = r.json()
    # Handle either {"values":[...]} or a bare list
    vals = data.get("values") if isinstance(data, dict) else data
    if not vals: raise RuntimeError("No Assets workspace found")
    return vals[0]["workspaceId"]

def list_object_types_flat(client: httpx.Client, ws: str, schema_id: str) -> List[Dict[str, Any]]:
    # Assets Cloud: GET /jsm/assets/workspace/{workspaceId}/v1/objectschema/{schemaId}/objecttypes/flat
    # Contains each object type, with icon metadata (id and icon URLs). 
    # Ref docs (object schema & type APIs): developer.atlassian.com/cloud/assets/rest/… 
    base = f"https://api.atlassian.com/jsm/assets/workspace/{ws}/v1"
    url = f"{base}/objectschema/{schema_id}/objecttypes/flat"
    r = client.get(url)
    r.raise_for_status()
    return r.json() or []

def get_object_type_attributes(client: httpx.Client, ws: str, obj_type_id: str) -> List[Dict[str, Any]]:
    # GET object type attributes list
    base = f"https://api.atlassian.com/jsm/assets/workspace/{ws}/v1"
    url = f"{base}/objecttype/{obj_type_id}/attributes"
    r = client.get(url)
    r.raise_for_status()
    return r.json() or []

def download_icon_png(client: httpx.Client, ws: str, icon_id: str, size: int, out_path: pathlib.Path) -> Optional[str]:
    # Assets Cloud icon endpoint:
    # GET /jsm/assets/workspace/{workspaceId}/v1/icon/{id}/icon.png  (Accept: image/png)
    # Docs: developer.atlassian.com/cloud/assets/rest/api-group-icon/
    base = f"https://api.atlassian.com/jsm/assets/workspace/{ws}/v1"
    url = f"{base}/icon/{icon_id}/icon.png"
    headers = {"Accept": "image/png"}
    params = {"size": str(size)}  # size=16|48 commonly
    r = client.get(url, headers=headers, params=params)
    if r.status_code == 200 and r.headers.get("Content-Type","").startswith("image/png"):
        out_path.write_bytes(r.content)
        return str(out_path.name)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return None

def main():
    ap = argparse.ArgumentParser(description="Export Assets schema definition with icons (Cloud).")
    ap.add_argument("--site", required=True, help="yourcompany.atlassian.net")
    ap.add_argument("--schema-id", required=True, help="Assets schema ID")
    ap.add_argument("--email", required=True)
    ap.add_argument("--api-token", required=True)
    ap.add_argument("--out-dir", default="./assets-schema-export")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    out_dir = pathlib.Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    icons_dir = out_dir / "icons"
    icons_dir.mkdir(exist_ok=True)

    headers = {
        "User-Agent": UA,
        "Authorization": f"Basic {b64_basic(args.email, args.api_token)}",
        "Accept": "application/json",
    }
    with httpx.Client(timeout=API_TIMEOUT, headers=headers) as client:
        log("INFO", f"Discovering workspace for {args.site} …")
        ws = get_workspace_id(client, args.site)
        log("INFO", f"workspaceId={ws}")

        log("INFO", f"Fetching object types for schema {args.schema_id} …")
        types = list_object_types_flat(client, ws, args.schema_id)
        if not types:
            log("INFO", "No object types found; nothing to export.")
            return 0

        exported: List[Dict[str, Any]] = []
        for t in types:
            tid = str(t.get("id"))
            tname = t.get("name") or f"type_{tid}"
            icon_meta = (t.get("icon") or {})
            icon_id = str(icon_meta.get("id") or "")
            local16 = local48 = None

            # Download both sizes if possible
            if icon_id and not args.dry_run:
                base_name = f"{norm_filename(tname)}__{icon_id}"
                p16 = icons_dir / f"{base_name}_16.png"
                p48 = icons_dir / f"{base_name}_48.png"
                local16 = download_icon_png(client, ws, icon_id, 16, p16)
                local48 = download_icon_png(client, ws, icon_id, 48, p48)

            # Get attributes for completeness
            attrs = get_object_type_attributes(client, ws, tid)

            # Build clean record with local icon refs (when available)
            rec = {
                "id": tid,
                "name": tname,
                "description": t.get("description"),
                "parentObjectTypeId": (t.get("parentObjectType") or {}).get("id") or t.get("parentObjectTypeId"),
                "icon": {
                    "id": icon_id or None,
                    "name": (icon_meta.get("name") if icon_meta else None),
                    "url16": local16 or icon_meta.get("url16"),
                    "url48": local48 or icon_meta.get("url48"),
                },
                "position": t.get("position"),
                "created": t.get("created"),
                "updated": t.get("updated"),
                "attributes": attrs,   # raw attribute definitions
            }
            exported.append(rec)

        # Write manifest
        manifest = {
            "site": args.site,
            "workspaceId": ws,
            "schemaId": args.schema_id,
            "exportedAt": iso_now(),
            "objectTypes": exported,
        }

        out_json = out_dir / "schema_with_icons.json"
        if args.dry_run:
            log("INFO", "[dry-run] Would write: " + str(out_json))
        else:
            out_json.write_text(json.dumps(manifest, indent=2))
            log("INFO", f"Wrote {out_json}")
            log("INFO", f"Icons (if any) saved in {icons_dir}")

    return 0

if __name__ == "__main__":
    sys.exit(main())    



"""
Example usage:
python export_assets_schema_with_icons.py \
  --site "yourcompany.atlassian.net" \
  --schema-id 27 \
  --email you@company.com \
  --api-token YOUR_API_TOKEN \
  --out-dir ./assets-schema-export \
  --dry-run
"""