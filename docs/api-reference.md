# API Reference

These are the Next.js API routes exposed by the application server. They act as a server-side proxy to the Atlassian Assets REST API to avoid CORS issues and keep credentials out of browser network logs.

All routes are under `/api/tools/`.

---

## `GET /api/tools/config-status`

Fetch the current configuration status of a JSM import source.

### Query parameters

| Parameter | Required | Description |
|---|---|---|
| `token` | Yes | Atlassian personal access token |
| `workspaceId` | Yes | JSM Assets workspace ID |
| `importSourceId` | Yes | Import source ID |

### Response

```json
{
  "status": "IDLE" | "DISABLED" | "MISSING_MAPPING" | "RUNNING"
}
```

### Error responses

| Status | Description |
|---|---|
| `400` | Missing required query parameters |
| `401` | Invalid or expired token |
| `404` | Import source not found |
| `502` | Upstream Atlassian API error (body contains details) |

---

## `GET /api/tools/mapping-progress`

Poll the progress of an async mapping push operation.

### Query parameters

| Parameter | Required | Description |
|---|---|---|
| `token` | Yes | Atlassian personal access token |
| `workspaceId` | Yes | JSM Assets workspace ID |
| `importSourceId` | Yes | Import source ID |
| `resourceId` | Yes | Resource ID returned by the async PUT/PATCH operation |

### Response

```json
{
  "status": "RUNNING" | "COMPLETED" | "FAILED",
  "progress": 75,
  "message": "Processing object types..."
}
```

### Error responses

| Status | Description |
|---|---|
| `400` | Missing required query parameters |
| `401` | Invalid or expired token |
| `404` | Resource ID not found |
| `502` | Upstream Atlassian API error |

---

## `POST /api/tools/push-mapping`

Push a schema-and-mapping document to a JSM import source.

### Request body (JSON)

```json
{
  "token": "string",
  "workspaceId": "string",
  "importSourceId": "string",
  "document": { /* AssetsImportDocument */ },
  "method": "put" | "patch",
  "async": true | false
}
```

| Field | Required | Default | Description |
|---|---|---|---|
| `token` | Yes | — | Atlassian personal access token |
| `workspaceId` | Yes | — | JSM Assets workspace ID |
| `importSourceId` | Yes | — | Import source ID |
| `document` | Yes | — | Full `AssetsImportDocument` to push |
| `method` | No | `"put"` | `"put"` replaces the full configuration; `"patch"` merges changes |
| `async` | No | `false` | If `true`, the Atlassian API runs the operation asynchronously and returns a `resourceId` for polling |

### Synchronous response (`async: false`)

```json
{
  "ok": true
}
```

### Asynchronous response (`async: true`)

```json
{
  "ok": true,
  "resourceId": "abc123"
}
```

Use the `resourceId` to poll `GET /api/tools/mapping-progress`.

### Error responses

| Status | Description |
|---|---|
| `400` | Missing required fields or malformed document |
| `401` | Invalid or expired token |
| `409` | Conflict — another operation is currently running (poll config-status first) |
| `502` | Upstream Atlassian API error (body contains details) |

---

## Atlassian API Reference

The server routes delegate to these upstream Atlassian endpoints:

| Operation | Atlassian endpoint |
|---|---|
| Get config status | `GET /importsource/{id}/configstatus` |
| Get schema and mapping | `GET /importsource/{id}/schema-and-mapping` |
| Put mapping | `PUT /importsource/{id}/mapping` |
| Patch mapping | `PATCH /importsource/{id}/mapping` |
| Get progress | `GET /importsource/{id}/mapping/progress/{resourceId}` |

Base URL: `https://api.atlassian.com/jsm/assets/workspace/{workspaceId}/v1`

Required OAuth scope: `import:import-configuration:cmdb`

Full Atlassian API spec: `https://dac-static.atlassian.com/cloud/assets/swagger.v3.json`
