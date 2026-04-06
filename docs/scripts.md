# Python Scripts

The `scripts/` directory contains Python 3 utilities for bulk operations against the JSM Assets Cloud API.

All scripts require Python 3.11+ with the packages in `requirements.txt` (`httpx`, `anyio`, `rich`). These are pre-installed in the Docker image's venv at `/opt/pyenv`.

---

## Running scripts

### Inside Docker

```bash
docker exec -it <container-name> /opt/pyenv/bin/python3 /app/scripts/<script>.py --help
```

### On your local machine

```bash
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

python3 scripts/<script>.py --help
```

---

## `export_assets_schema_with_icons.py`

Exports all object types from a JSM Assets schema, including downloading their icons (16px and 48px) to a local directory.

### Usage

```bash
python3 scripts/export_assets_schema_with_icons.py \
  --site mycompany.atlassian.net \
  --schema-id 27 \
  --email user@example.com \
  --api-token <atlassian-api-token> \
  --out-dir ./assets-schema-export
```

### Arguments

| Argument | Required | Default | Description |
|---|---|---|---|
| `--site` | Yes | — | Atlassian cloud domain (e.g., `mycompany.atlassian.net`) |
| `--schema-id` | Yes | — | Assets schema ID (integer, visible in the schema URL) |
| `--email` | Yes | — | Atlassian account email |
| `--api-token` | Yes | — | Atlassian API token |
| `--out-dir` | No | `./assets-schema-export` | Output directory (created if it does not exist) |
| `--dry-run` | No | false | Print what would be exported without downloading anything |

The workspace ID is auto-detected from the site domain — no need to supply it.

### Output

```
<out-dir>/
  schema_with_icons.json        ← All object types with attributes and icon metadata
  icons/
    <TypeName>__<iconId>_16.png ← 16px icon per object type
    <TypeName>__<iconId>_48.png ← 48px icon per object type
```

`schema_with_icons.json` contains a manifest with `site`, `workspaceId`, `schemaId`, `exportedAt`, and an `objectTypes` array. Each entry includes the raw attribute definitions and local icon file references.

---

## `fast_delete_assets_object_types.py`

Deletes **all** object types in a JSM Assets schema using parallel async requests. Types are deleted in waves — deepest children first, then their parents — to avoid constraint errors.

> **Warning:** This deletes every object type in the schema. All assets of those types will also be deleted. This is irreversible. Use `--dry-run` first.

### Usage

```bash
python3 scripts/fast_delete_assets_object_types.py \
  --site mycompany.atlassian.net \
  --schema-id 27 \
  --email user@example.com \
  --api-token <atlassian-api-token> \
  --dry-run
```

Any argument not provided on the command line is prompted interactively (the API token is prompted as a hidden input).

### Arguments

| Argument | Required | Default | Description |
|---|---|---|---|
| `--site` | No* | — | Atlassian cloud domain |
| `--schema-id` | No* | — | Assets schema ID |
| `--email` | No* | — | Atlassian account email |
| `--api-token` | No* | — | Atlassian API token |
| `--max-workers` | No | `16` | Number of parallel delete requests per wave |
| `--dry-run` | No | false | Show the deletion plan without deleting anything |
| `--continue-on-error` | No | true | Keep going if individual deletions fail |
| `--fail-fast` | No | false | Stop on first error (overrides `--continue-on-error`) |
| `--log-level` | No | `INFO` | One of `DEBUG`, `INFO`, `WARN`, `ERROR` |

\* Prompted interactively if not provided.

### How it works

1. Auto-detects workspace ID from the site domain
2. Lists all object types in the schema (flat list with parent relationships)
3. Computes deletion waves: deepest types first, root types last
4. Prints a Rich table showing the plan (wave number, type ID, name, parent ID)
5. Executes deletions in parallel within each wave; waits for each wave to complete before starting the next
6. Prints a summary: status, deleted count, error count

---

## `guid_replacer.py`

Replaces `cmdb::externalId/UUID` values in a schema JSON file with human-readable identifiers derived from the object type and attribute names.

### Usage

```bash
python3 scripts/guid_replacer.py <input_file.json>
```

Takes a single positional argument — the path to the JSON file. There are no other flags.

### Behaviour

1. Loads and parses the JSON file
2. Scans all object types and attributes, building a mapping of `UUID → readable-name`
3. Prints the full mapping for review
4. **Prompts for confirmation** before making any changes (`y/N`)
5. Writes the result to a new file: `<input_stem>_cleaned.json` in the same directory
6. The original file is never modified
7. Verifies no GUIDs remain in the output and reports any that do

### Naming convention

- Object types: `cmdb-{object-type-name}` — e.g., `cmdb-users`, `cmdb-virtual-machines`
- Attributes: `{object-type-name}-{attribute-name}` — e.g., `users-email`, `virtual-machines-hostname`
- Duplicate names get a numeric suffix: `cmdb-servers-2`
- Any remaining unresolved GUIDs (e.g., in `referenceObjectTypeExternalId`) are mapped to `cmdb-ref-{first-8-chars}`

### Example

```
$ python3 scripts/guid_replacer.py my_schema.json

Object Type: Users -> cmdb-users
  Attribute: Email -> users-email
  Attribute: Name -> users-name
...
Found 47 GUID mappings to replace

Proceed with replacing 47 GUIDs? (y/N): y

✅ All GUIDs have been replaced with human-readable names.
✅ Original file preserved: my_schema.json
✅ Clean file created: my_schema_cleaned.json
```

---

## `sync_icons_schema.py`

Copies object type icons from one JSM Assets Cloud schema to another, matching types by name. Useful for keeping icon assignments in sync between a staging and production schema.

### Usage

```bash
python3 scripts/sync_icons_schema.py \
  --src-site source.atlassian.net \
  --src-schema-id 27 \
  --src-email user@source.com \
  --src-token <source-api-token> \
  --dst-site dest.atlassian.net \
  --dst-schema-id 12 \
  --dst-email user@dest.com \
  --dst-token <dest-api-token> \
  --dry-run
```

Any argument not provided is prompted interactively (tokens are prompted as hidden inputs).

### Arguments

| Argument | Required | Default | Description |
|---|---|---|---|
| `--src-site` | No* | — | Source Atlassian cloud domain |
| `--src-schema-id` | No* | — | Source schema ID |
| `--src-email` | No* | — | Source account email |
| `--src-token` | No* | — | Source API token |
| `--dst-site` | No* | — | Destination Atlassian cloud domain |
| `--dst-schema-id` | No* | — | Destination schema ID |
| `--dst-email` | No* | — | Destination account email |
| `--dst-token` | No* | — | Destination API token |
| `--ignore-case` | No | false | Match type names case-insensitively |
| `--force` | No | false | Update even when source and destination already have the same icon ID |
| `--max-workers` | No | `12` | Parallel update requests |
| `--dry-run` | No | false | Show the sync plan without applying any changes |
| `--continue-on-error` | No | true | Keep going if individual updates fail |
| `--fail-fast` | No | false | Stop on first error |
| `--log-level` | No | `INFO` | One of `DEBUG`, `INFO`, `WARN`, `ERROR` |
| `--trace-http` | No | false | Log all HTTP request/response bodies (useful for debugging) |

\* Prompted interactively if not provided.

### How it works

1. Connects to both source and destination using separate authenticated clients
2. Lists all object types from both schemas
3. Matches types by name (optionally case-insensitive)
4. Prints a Rich table showing each type: action (`UPDATE` / `SKIP` / `MISSING_DST`), source icon ID, destination type ID, and current destination icon ID
5. Applies icon updates in parallel using `PUT /objecttype/{id}` with the source icon ID
6. Prints a summary: status, updated count, error count
