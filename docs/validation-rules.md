# Validation Rules

All validation rules return structured `Diagnostic` objects with a stable `code`, a `severity`, a human-readable `message`, a JSON Pointer `path`, and an optional `suggestion`.

Rules are evaluated in five ordered layers. Evaluation stops early if a lower layer produces blocking errors (e.g., if JSON cannot be parsed, shape checks do not run).

---

## Layer 1 — Parse

| Code | Severity | Description |
|---|---|---|
| `PARSE_FAILED` | error | Input is not valid JSON. The `message` includes the parse error detail. |

---

## Layer 2 — Shape

| Code | Severity | Description |
|---|---|---|
| `INVALID_SHAPE` | error | Top-level structure does not match the expected schema (missing `schema` or `mapping` sections, wrong types). |
| `MISSING_OBJECT_SCHEMA` | error | `schema.objectSchema` is missing or not an object. |
| `MISSING_OBJECT_TYPES` | error | `schema.objectSchema.objectTypes` is missing or not an array. |
| `MISSING_OBJECT_TYPE_MAPPINGS` | error | `mapping.objectTypeMappings` is missing or not an array. |

---

## Layer 3 — Contract

These rules check for compliance with the Atlassian Assets external import contract.

| Code | Severity | Description |
|---|---|---|
| `MISSING_REQUIRED_FIELD` | error | A required field is absent. `path` points to the containing object; `message` names the missing field. |
| `WRONG_FIELD_TYPE` | error | A field has the wrong JSON type (e.g., `externalId` is a number instead of a string). |
| `INVALID_ATTRIBUTE_TYPE` | error | An attribute `type` value is not one of the permitted enum values. |
| `INVALID_UNKNOWN_VALUES` | error | `unknownValues` is not one of `IGNORE`, `WARN`, `ERROR`. |
| `NEGATIVE_CARDINALITY` | error | `minimumCardinality` is negative, or `maximumCardinality` is less than -1. |
| `INVALID_CARDINALITY_RANGE` | warning | `maximumCardinality` is less than `minimumCardinality` (and neither is -1). |

---

## Layer 4 — Cross-reference

These rules verify that identifiers referenced in the mapping section actually exist in the schema section.

| Code | Severity | Description |
|---|---|---|
| `UNKNOWN_OBJECT_TYPE_REF` | error | A mapping entry's `objectTypeExternalId` does not match any object type in the schema. |
| `UNKNOWN_ATTRIBUTE_REF` | error | A mapping entry's `attributeExternalId` does not match any attribute on the referenced object type. |
| `UNKNOWN_REFERENCE_TARGET` | error | A `referenced_object` attribute's `referenceObjectTypeExternalId` does not match any object type in the schema. |

---

## Layer 5 — Business Rules

These rules catch structural issues that pass schema validation but indicate incorrect or incomplete configurations.

### Duplicates

| Code | Severity | Description |
|---|---|---|
| `DUPLICATE_OBJECT_TYPE_ID` | error | Two or more object types share the same `externalId`. |
| `DUPLICATE_ATTRIBUTE_ID` | error | Two or more attributes on the same object type share the same `externalId`. |
| `DUPLICATE_MAPPING` | warning | Two mapping entries reference the same `objectTypeExternalId`. |

### Labels and identity

| Code | Severity | Description |
|---|---|---|
| `MISSING_LABEL_ATTRIBUTE` | warning | An object type has no attribute with `label: true`. Every object type should have at least one label attribute so JSM can display a human-readable name for assets. |
| `MISSING_EXTERNAL_ID_PART` | warning | A mapping entry has no attribute with `externalIdPart: true`. Without this, JSM cannot generate stable external IDs and may create duplicate assets on re-import. |

### Referenced objects

| Code | Severity | Description |
|---|---|---|
| `REF_MISSING_REFERENCE_TYPE` | error | A `referenced_object` attribute is missing `referenceObjectTypeExternalId`. |
| `REFERENCED_OBJ_MISSING_IQL` | warning | A `referenced_object` attribute mapping has no `objectMappingIQL`. Without this, JSM cannot resolve the referenced asset during import. |

### Cardinality

| Code | Severity | Description |
|---|---|---|
| `SUSPICIOUS_MAX_CARDINALITY` | warning | `maximumCardinality` is set to 0, which means the attribute can never hold a value. This is almost certainly a misconfiguration. |
| `REQUIRED_UNMAPPED` | warning | An attribute with `minimumCardinality >= 1` has no corresponding mapping entry. The import will fail for any record that does not provide this attribute value. |

### Inheritance

| Code | Severity | Description |
|---|---|---|
| `INHERITANCE_ATTRIBUTE_CONFLICT` | error | A child object type defines an attribute with the same `externalId` as an attribute on a parent type that has `inheritance: true`. |
| `CIRCULAR_REFERENCE` | error | A chain of `referenced_object` attributes forms a cycle (A → B → A). |

### Name consistency

| Code | Severity | Description |
|---|---|---|
| `MAPPING_NAME_MISMATCH` | warning | `objectTypeName` in a mapping entry differs from the corresponding object type's `name` in the schema. These are informational fields, but inconsistency can cause confusion. |
| `MAPPING_ATTR_NAME_MISMATCH` | warning | `attributeName` in a mapping entry differs from the attribute's `name` in the schema. |

---

## Planned rules (not yet implemented)

| Code | Description |
|---|---|
| `SELECTOR_SYNTAX` | Validate JQL selector syntax for common patterns |
| `STATUS_SCHEMA_REF` | Verify status attribute values exist in the status schema |
| `PATCH_SAFETY` | Warn if a PATCH operation removes required fields present in the current live config |
| `LARGE_SCHEMA_PERF` | Info-level hint when the schema exceeds 100 object types (suggest reviewing index strategy) |

---

## Using diagnostics programmatically

All validators in `src/domain/validators/` return `Diagnostic[]`. You can consume these directly:

```ts
import { validateDocument } from '@/domain/validators/validateDocument';
import { validateContract } from '@/domain/validators/validateContract';

const diagnostics = [
  ...validateContract(doc),
  ...validateDocument(doc),
];

const errors = diagnostics.filter(d => d.severity === 'error');
```

Diagnostic codes are stable identifiers — they will not be renamed or removed between versions of the application.
