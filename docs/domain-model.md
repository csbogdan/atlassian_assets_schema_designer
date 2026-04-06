# Domain Model

This document describes the core data types used throughout the application. All types are defined in `src/domain/model/types.ts`.

---

## `AssetsImportDocument`

The top-level document type. Every project stores exactly one of these.

```ts
interface AssetsImportDocument {
  $schema?: string;              // Optional JSON Schema URI
  schema: {
    objectSchema: ObjectSchemaDefinition;
    statusSchema?: StatusSchemaDefinition;
  };
  mapping: {
    objectTypeMappings: ObjectTypeMappingDefinition[];
  };
}
```

---

## `ObjectSchemaDefinition`

The schema section — defines what object types and attributes exist.

```ts
interface ObjectSchemaDefinition {
  name?: string;
  description?: string;
  objectTypes: ObjectTypeDefinition[];
}
```

---

## `ObjectTypeDefinition`

A single object type. Object types can nest (children form a tree).

```ts
interface ObjectTypeDefinition {
  externalId: string;           // Unique stable identifier
  name: string;
  description?: string;
  iconKey?: string;
  inheritance?: boolean;        // If true, children inherit this type's attributes
  attributes: AttributeDefinition[];
  children?: ObjectTypeDefinition[];
}
```

---

## `AttributeDefinition`

An attribute on an object type.

```ts
interface AttributeDefinition {
  externalId: string;
  name: string;
  description?: string;
  type: AttributeType;
  label?: boolean;              // This attribute is the human-readable label for the object
  unique?: boolean;
  minimumCardinality?: number;  // 0 = optional, 1+ = required
  maximumCardinality?: number;  // -1 = unlimited
  referenceObjectTypeExternalId?: string;  // For type: 'referenced_object'
  referenceObjectTypeName?: string;
  typeValues?: string[];        // For type: 'select' — the allowed values
}
```

### `AttributeType` enum

```ts
type AttributeType =
  | 'text'
  | 'textarea'
  | 'integer'
  | 'double'
  | 'boolean'
  | 'date'
  | 'time'
  | 'date_time'
  | 'email'
  | 'url'
  | 'status'
  | 'referenced_object'
  | 'select'
  | 'ipaddress';
```

---

## `ObjectTypeMappingDefinition`

Describes how source data maps to a specific object type.

```ts
interface ObjectTypeMappingDefinition {
  objectTypeExternalId: string;    // Must match a schema objectType.externalId
  objectTypeName?: string;         // Informational — should match schema name
  selector: string;                // JQL query or CSV file pattern for source records
  description?: string;
  unknownValues?: 'IGNORE' | 'WARN' | 'ERROR';
  attributesMapping: AttributeMappingDefinition[];
}
```

---

## `AttributeMappingDefinition`

Describes how a specific attribute value is extracted from source data.

```ts
interface AttributeMappingDefinition {
  attributeExternalId: string;     // Must match an attribute.externalId on the object type
  attributeName?: string;          // Informational
  attributeLocators?: string[];    // Source field names or expressions
  externalIdPart?: boolean;        // This attribute contributes to the generated externalId
  objectMappingIQL?: string;       // For referenced_object attrs — IQL to resolve the ref
  valueMapping?: Record<string, string>;  // Optional value translation table
}
```

---

## `StatusSchemaDefinition`

Optional section defining custom statuses.

```ts
interface StatusSchemaDefinition {
  statuses?: StatusDefinition[];
}

interface StatusDefinition {
  externalId: string;
  name: string;
  description?: string;
  category?: string;
}
```

---

## `Diagnostic`

All validators return arrays of these.

```ts
type DiagnosticSeverity = 'error' | 'warning' | 'info';

interface Diagnostic {
  code: string;                  // Stable identifier, e.g. 'DUPLICATE_OBJECT_TYPE_ID'
  severity: DiagnosticSeverity;
  message: string;               // Human-readable description
  path: string;                  // RFC 6901 JSON Pointer to the offending location
  relatedPaths?: string[];       // Other locations involved in the issue
  suggestion?: string;           // How to fix it
}
```

---

## `FlattenedObjectType`

Used internally by selectors and UI components that need a flat list of all object types (the schema tree is recursive).

```ts
interface FlattenedObjectType {
  objectType: ObjectTypeDefinition;
  depth: number;                 // 0 = root type
  path: string;                  // JSON Pointer to this node in the tree
  parentExternalId?: string;
  inheritedAttributes: AttributeDefinition[];  // Attributes from ancestor types
}
```

---

## Atlassian API Types

### `ConfigStatus`

```ts
type ConfigStatus = 'IDLE' | 'DISABLED' | 'MISSING_MAPPING' | 'RUNNING';
```

| Value | Meaning |
|---|---|
| `IDLE` | No operation in progress; mapping is configured |
| `DISABLED` | Import source is disabled |
| `MISSING_MAPPING` | No mapping has been pushed yet |
| `RUNNING` | An import or mapping update is currently running |

### `ApiResult`

```ts
interface ApiResult {
  ok: boolean;
  resourceId?: string;   // Present when async: true; used to poll progress
}
```

### `ProgressResult`

```ts
interface ProgressResult {
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  progress?: number;    // 0–100
  message?: string;
}
```
