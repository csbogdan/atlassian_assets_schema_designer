# Architecture

## Table of Contents

1. [Principles](#principles)
2. [Project Structure](#project-structure)
3. [Layer Overview](#layer-overview)
4. [Domain Layer](#domain-layer)
5. [State Management](#state-management)
6. [Feature Slices](#feature-slices)
7. [API Routes](#api-routes)
8. [Validation Pipeline](#validation-pipeline)
9. [Worker Architecture](#worker-architecture)
10. [Persistence Model](#persistence-model)
11. [Key Patterns](#key-patterns)

---

## Principles

- **Business logic lives only in `/src/domain`** — never inside React components or Zustand actions
- **Components are thin** — they read from selectors and dispatch actions; they do no computation
- **All validators return `Diagnostic[]`** — structured errors with codes, paths, severities, and suggestions
- **State updates are immutable** — Zustand actions produce new objects, never mutate in place
- **Performance for large schemas** — indexes keyed by `externalId`, Web Worker for validation

---

## Project Structure

```
/
├── Dockerfile
├── next.config.ts
├── tailwind.config.ts
├── src/
│   ├── app/
│   │   ├── page.tsx              ← Main app shell (tabs, top bar, project switcher)
│   │   ├── globals.css           ← Tailwind base + component classes
│   │   └── api/
│   │       └── tools/
│   │           ├── config-status/route.ts
│   │           ├── mapping-progress/route.ts
│   │           └── push-mapping/route.ts
│   ├── components/
│   │   ├── Panel.tsx             ← Generic titled panel wrapper
│   │   └── ConfirmModal.tsx      ← Reusable confirmation dialog
│   ├── domain/
│   │   ├── model/
│   │   │   └── types.ts          ← Core TypeScript types + Zod schemas
│   │   ├── normalizers/          ← JSON → domain model (parse + normalise)
│   │   ├── validators/           ← Validation layers returning Diagnostic[]
│   │   ├── transformers/         ← Pure document transformations
│   │   ├── selectors/            ← Derived data (indexes, stats, search index)
│   │   └── api/
│   │       └── assetsImportSourceApi.ts  ← Atlassian API abstraction
│   ├── features/
│   │   ├── schema/               ← Schema Explorer, Reference Graph, Stats, Bulk Add
│   │   ├── mapping/              ← Mapping Explorer
│   │   ├── diff/                 ← Semantic Diff, Changelog
│   │   ├── search/               ← Full-text search UI
│   │   ├── project/              ← Project management panel
│   │   └── tools/                ← Tools panel (import, push, export, bulk ops)
│   ├── stores/
│   │   └── documentStore.ts      ← Zustand store (single source of truth)
│   ├── workers/                  ← Web Worker for off-thread validation
│   └── tests/
│       └── domain.test.ts        ← Unit tests for domain functions
├── scripts/
│   ├── export_assets_schema_with_icons.py
│   ├── fast_delete_assets_object_types.py
│   ├── guid_replacer.py
│   └── sync_icons_schema.py
└── docs/
```

---

## Layer Overview

```
┌──────────────────────────────────────────┐
│  React Components (features/, app/)      │  UI only — no business logic
├──────────────────────────────────────────┤
│  Zustand Store (stores/documentStore.ts) │  Global state + actions
├──────────────────────────────────────────┤
│  Domain (domain/)                        │  Pure functions: parse, validate, transform
│    ├── model/types.ts                    │  TypeScript types + Zod schemas
│    ├── normalizers/                      │  JSON → AssetsImportDocument
│    ├── validators/                       │  → Diagnostic[]
│    ├── transformers/                     │  Document → Document (immutable)
│    ├── selectors/                        │  Document → derived data
│    └── api/                              │  Atlassian API client interface
├──────────────────────────────────────────┤
│  Web Worker (workers/)                   │  Off-thread validation for large docs
├──────────────────────────────────────────┤
│  Next.js API Routes (app/api/)           │  Server-side proxy to Atlassian API
└──────────────────────────────────────────┘
```

---

## Domain Layer

### `domain/model/types.ts`

Central type definitions. Key types:

```ts
interface AssetsImportDocument {
  $schema?: string;
  schema: {
    objectSchema: ObjectSchemaDefinition;
    statusSchema?: StatusSchemaDefinition;
  };
  mapping: {
    objectTypeMappings: ObjectTypeMappingDefinition[];
  };
}

type Diagnostic = {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  path: string;            // JSON Pointer, e.g. "/schema/objectSchema/objectTypes/0"
  relatedPaths?: string[];
  suggestion?: string;
};
```

### `domain/normalizers/`

- `parseDocument(json: string): AssetsImportDocument` — parse raw JSON, apply Zod schema, throw on failure
- `flattenObjectTypes(root: ObjectSchemaDefinition): FlattenedObjectType[]` — recursive tree → flat list with depth/path metadata

### `domain/validators/`

One module per validation layer:

| Module | Layer |
|---|---|
| `validateContract.ts` | Shape + contract checks |
| `validateDocument.ts` | Cross-reference checks |
| `validationRules.ts` | Business rule checks |
| `validateCircularReferences.ts` | Cycle detection in `referenced_object` attrs |
| `validateInheritanceConflicts.ts` | Attribute conflicts across inheritance chains |

Each validator function signature: `(doc: AssetsImportDocument, config?: ValidationConfig) => Diagnostic[]`

### `domain/transformers/`

Pure document transformations:

| Module | Description |
|---|---|
| `bulkAddAttribute.ts` | Add an attribute to multiple object types |
| `cloneObjectType.ts` | Deep-clone an object type with a new externalId |
| `exportCsv.ts` | Serialize schema to CSV |
| `exportMarkdown.ts` | Serialize schema to Markdown table |
| `changelogNarrative.ts` | Generate narrative text from a semantic diff |

### `domain/selectors/`

Derived data, computed from the document on demand:

| Module | Returns |
|---|---|
| `attributeUsage.ts` | Which object types use a given attribute externalId |
| `deadMappings.ts` | Mapping entries with no matching schema object type |
| `mappingCompleteness.ts` | % of attributes covered by mappings |
| `referenceGraph.ts` | Graph edges from `referenced_object` attributes |
| `schemaStats.ts` | Type/attribute counts, averages |
| `searchIndex.ts` | Flat search index for full-text queries |

### `domain/api/assetsImportSourceApi.ts`

Interface + factory for the Atlassian Assets REST API:

```ts
interface AssetsImportSourceApi {
  getSchemaAndMapping(id: string): Promise<AssetsImportDocument>;
  putMapping(id: string, doc: AssetsImportDocument, async?: boolean): Promise<ApiResult>;
  patchMapping(id: string, doc: Partial<AssetsImportDocument>, async?: boolean): Promise<ApiResult>;
  getMappingProgress(id: string, resourceId: string): Promise<ProgressResult>;
  getConfigStatus(id: string): Promise<ConfigStatus>;
}

function createAssetsImportSourceApi(token: string, workspaceId: string): AssetsImportSourceApi
```

Base URL: `https://api.atlassian.com/jsm/assets/workspace/{workspaceId}/v1`

---

## State Management

Single Zustand store in `stores/documentStore.ts`.

### Key state fields

| Field | Type | Description |
|---|---|---|
| `document` | `AssetsImportDocument \| null` | Parsed document (source of truth for all views) |
| `rawJson` | `string` | Current editor content (may be unparsed/invalid) |
| `diagnostics` | `Diagnostic[]` | Latest validation results |
| `validationPending` | `boolean` | True while Web Worker is running |
| `diskProjectId` | `string \| null` | ID of the currently loaded on-disk project |
| `focusedPath` | `string \| undefined` | JSON Pointer to navigate to in the editor |
| `baseline` | `AssetsImportDocument \| null` | Snapshot for diff comparison |
| `history` | undo/redo stacks | `DocumentSnapshot[]` |

### Key actions

| Action | Description |
|---|---|
| `loadDocument(json, opts?)` | Parse JSON, run validation, update `document` and `diagnostics` |
| `setRawJson(s)` | Update raw editor content without re-parsing |
| `setFocusedPath(path)` | Navigate editor to a JSON Pointer location |
| `loadDiskProject(id)` | Load a project from disk by ID |
| `saveDiskProject()` | Persist current document to disk |
| `setBaseline(doc)` | Store a diff baseline |
| `undo() / redo()` | Navigate history |

### Persistence

Zustand `persist` middleware writes `diskProjectId` and `rawJson` to `localStorage`. On hard refresh, `page.tsx` checks `getState().diskProjectId` and calls `loadDiskProject` if a document is not yet hydrated.

---

## Feature Slices

Each feature in `features/` is a self-contained UI module:

- **No feature module imports from another feature module** — all shared state goes through the Zustand store
- Feature components read state via selectors and dispatch actions
- Heavy computation (diff, search indexing) is done in domain functions, not in component code

---

## API Routes

Next.js API routes in `app/api/tools/` act as a server-side proxy to the Atlassian API. This avoids CORS issues and keeps the Atlassian token out of the browser's network tab for API calls from the server side.

See [API Reference](api-reference.md) for full documentation.

---

## Validation Pipeline

Validation runs in a Web Worker to avoid blocking the UI:

1. `rawJson` changes in the editor
2. 700 ms debounce fires
3. `loadDocument(rawJson)` is called
4. Main thread posts a message to the validation worker
5. Worker runs all five validation layers
6. Worker posts `Diagnostic[]` back to main thread
7. Store updates `diagnostics` and clears `validationPending`
8. Raw JSON Editor sets Monaco markers from `diagnostics`

For documents ≤ ~20 object types, validation completes in < 50 ms. For 100+ object types, validation completes in < 500 ms (Worker removes blocking from the main thread entirely).

---

## Persistence Model

```
localStorage
  └── documentStore (Zustand persist)
        ├── diskProjectId   ← which project is active
        └── rawJson         ← last editor content

/app/projects/ (or ~/projects on dev)
  └── <uuid>/
        ├── meta.json       ← { id, name, createdAt, updatedAt }
        └── document.json   ← AssetsImportDocument (JSON)
```

Documents are stored as pretty-printed JSON so they are human-readable and git-diffable if you choose to version-control your projects directory.

---

## Key Patterns

### Diagnostic codes

All diagnostic codes follow `SCREAMING_SNAKE_CASE`. Codes are stable identifiers — they will not be changed between versions. Example codes:

```
PARSE_FAILED
INVALID_SHAPE
MISSING_REQUIRED_FIELD
UNKNOWN_OBJECT_TYPE_REF
DUPLICATE_OBJECT_TYPE_ID
MISSING_LABEL_ATTRIBUTE
MISSING_EXTERNAL_ID_PART
REFERENCED_OBJ_MISSING_IQL
CIRCULAR_REFERENCE
INHERITANCE_ATTRIBUTE_CONFLICT
```

### JSON Pointer paths

All `Diagnostic.path` values are valid [RFC 6901 JSON Pointers](https://datatracker.ietf.org/doc/html/rfc6901), e.g.:
```
/schema/objectSchema/objectTypes/0/attributes/2/type
/mapping/objectTypeMappings/1/attributesMapping/0/attributeExternalId
```

The Raw JSON Editor uses these pointers to place Monaco markers and navigate the cursor.

### Immutable updates

All transformers produce new objects. Example pattern:

```ts
// Good — new object
return {
  ...doc,
  schema: {
    ...doc.schema,
    objectSchema: {
      ...doc.schema.objectSchema,
      objectTypes: newObjectTypes,
    },
  },
};

// Bad — mutation
doc.schema.objectSchema.objectTypes.push(newType); // never
```
