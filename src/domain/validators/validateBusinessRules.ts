import type { AssetsImportDocument, Diagnostic } from '@/domain/model/types';
import { buildIndexes, flattenObjectTypes } from '@/domain/selectors/indexes';

export function validateBusinessRules(document: AssetsImportDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const flattened = flattenObjectTypes(document.schema.objectSchema.objectTypes);
  const indexes = buildIndexes(document);

  // --- Duplicate object type externalId across the whole tree ---
  const seenTypeIds = new Map<string, string>(); // externalId → jsonPath
  for (const item of flattened) {
    const existing = seenTypeIds.get(item.objectType.externalId);
    if (existing !== undefined) {
      diagnostics.push({
        code: 'DUPLICATE_OBJECT_TYPE_EXTERNAL_ID',
        severity: 'error',
        message: `Duplicate object type externalId "${item.objectType.externalId}".`,
        path: `${item.jsonPath}/externalId`,
        relatedPaths: [`${existing}/externalId`],
        suggestion: 'Every object type must have a unique externalId. Rename or remove the duplicate.',
      });
    } else {
      seenTypeIds.set(item.objectType.externalId, item.jsonPath);
    }
  }

  // --- Duplicate attribute externalId globally across the whole schema tree ---
  // Atlassian enforces uniqueness at the workspace level via a DB unique index
  // (obj_type_attr__workspace_id__external_id__unique_idx), so the same
  // attribute externalId in two different object types is also a violation.
  type AttrLocation = { path: string; typeExternalId: string };
  const attrIdLocations = new Map<string, AttrLocation[]>();
  for (const item of flattened) {
    for (const [attrIndex, attr] of (item.objectType.attributes ?? []).entries()) {
      const path = `${item.jsonPath}/attributes/${attrIndex}/externalId`;
      const existing = attrIdLocations.get(attr.externalId);
      if (existing) {
        existing.push({ path, typeExternalId: item.objectType.externalId });
      } else {
        attrIdLocations.set(attr.externalId, [{ path, typeExternalId: item.objectType.externalId }]);
      }
    }
  }
  for (const [attrExternalId, locations] of attrIdLocations) {
    if (locations.length < 2) continue;
    const allPaths = locations.map((l) => l.path);
    const typeList = locations.map((l) => `"${l.typeExternalId}"`).join(', ');
    for (const loc of locations) {
      diagnostics.push({
        code: 'DUPLICATE_ATTRIBUTE_EXTERNAL_ID',
        severity: 'error',
        message: `Attribute externalId "${attrExternalId}" is used in multiple object types: ${typeList}. Atlassian requires globally unique attribute externalIds.`,
        path: loc.path,
        relatedPaths: allPaths.filter((p) => p !== loc.path),
        suggestion: 'Rename this attribute to a unique externalId. Reusing the same externalId across object types causes a duplicate key violation on the Atlassian backend.',
      });
    }
  }

  // --- Duplicate attribute name within the same object type ---
  for (const item of flattened) {
    const seenAttrNames = new Map<string, number>(); // name → first index
    for (const [attrIndex, attr] of (item.objectType.attributes ?? []).entries()) {
      const nameLower = attr.name.trim().toLowerCase();
      if (!nameLower) continue;
      const existing = seenAttrNames.get(nameLower);
      if (existing !== undefined) {
        diagnostics.push({
          code: 'DUPLICATE_ATTRIBUTE_NAME',
          severity: 'error',
          message: `Object type "${item.objectType.externalId}" has duplicate attribute name "${attr.name}".`,
          path: `${item.jsonPath}/attributes/${attrIndex}/name`,
          relatedPaths: [`${item.jsonPath}/attributes/${existing}/name`],
          suggestion: 'Each attribute within an object type should have a unique name.',
          metadata: { objectTypeExternalId: item.objectType.externalId, attributeExternalId: attr.externalId },
        });
      } else {
        seenAttrNames.set(nameLower, attrIndex);
      }
    }
  }

  // --- Object type rules ---
  for (const item of flattened) {
    const { objectType, jsonPath, effectiveAttributes } = item;

    if (effectiveAttributes.length > 0) {
      const labelCount = effectiveAttributes.filter((a) => a.label).length;

      if (labelCount === 0) {
        diagnostics.push({
          code: 'LABEL_ATTRIBUTE_MISSING',
          severity: 'warning',
          message: `Object type "${objectType.externalId}" has no label attribute.`,
          path: `${jsonPath}/attributes`,
          suggestion: 'Mark one attribute as label=true to define the display name used by the Atlassian importer.',
          metadata: { objectTypeExternalId: objectType.externalId },
        });
      }

      if (labelCount > 1) {
        diagnostics.push({
          code: 'LABEL_ATTRIBUTE_DUPLICATE',
          severity: 'warning',
          message: `Object type "${objectType.externalId}" has ${labelCount} label attributes — only one is valid.`,
          path: `${jsonPath}/attributes`,
          suggestion: 'Only one attribute per object type should be marked as label=true.',
          metadata: { objectTypeExternalId: objectType.externalId },
        });
      }
    }

  }

  // --- Mapping rules ---
  const seenMappingIds = new Map<string, number>();

  for (const [mappingIndex, mapping] of document.mapping.objectTypeMappings.entries()) {
    const basePath = `/mapping/objectTypeMappings/${mappingIndex}`;

    // Duplicate mapping for same object type
    const existingIndex = seenMappingIds.get(mapping.objectTypeExternalId);
    if (existingIndex !== undefined) {
      diagnostics.push({
        code: 'DUPLICATE_MAPPING_OBJECT_TYPE',
        severity: 'error',
        message: `Duplicate mapping for object type "${mapping.objectTypeExternalId}".`,
        path: basePath,
        relatedPaths: [`/mapping/objectTypeMappings/${existingIndex}`],
        suggestion: 'Each object type can only have one mapping entry. Remove the duplicate.',
        metadata: { objectTypeExternalId: mapping.objectTypeExternalId },
      });
    } else {
      seenMappingIds.set(mapping.objectTypeExternalId, mappingIndex);
    }

    const schemaObject = indexes.objectTypesByExternalId.get(mapping.objectTypeExternalId);

    for (const [attrIndex, attrMapping] of mapping.attributesMapping.entries()) {
      const attrPath = `${basePath}/attributesMapping/${attrIndex}`;
      const schemaAttribute = schemaObject?.attributeLookup.get(attrMapping.attributeExternalId)?.attribute;

      // IQL on a non-referenced_object attribute
      if (attrMapping.objectMappingIQL && schemaAttribute && schemaAttribute.type !== 'referenced_object') {
        diagnostics.push({
          code: 'IQL_ON_NON_REFERENCED_ATTRIBUTE',
          severity: 'warning',
          message: `Attribute mapping "${attrMapping.attributeExternalId}" has objectMappingIQL but its schema type is "${schemaAttribute.type}" (not referenced_object).`,
          path: `${attrPath}/objectMappingIQL`,
          suggestion: 'Remove objectMappingIQL or change the attribute type to referenced_object.',
          metadata: {
            objectTypeExternalId: mapping.objectTypeExternalId,
            attributeExternalId: attrMapping.attributeExternalId,
          },
        });
      }

      // Incomplete value mapping for status attributes
      // typeValues on status attributes lists valid status names; the mapping's
      // valueMapping should cover each of them.
      if (
        schemaAttribute?.type === 'status' &&
        schemaAttribute.typeValues &&
        schemaAttribute.typeValues.length > 0
      ) {
        const currentValueMapping = attrMapping.valueMapping ?? {};
        const missingValues = schemaAttribute.typeValues.filter((v) => !(v in currentValueMapping));

        if (missingValues.length > 0) {
          diagnostics.push({
            code: 'VALUE_MAPPING_INCOMPLETE',
            severity: 'warning',
            message: `Status value mapping for "${attrMapping.attributeExternalId}" is missing entries for: ${missingValues.join(', ')}.`,
            path: `${attrPath}/valueMapping`,
            suggestion: `Add valueMapping entries for the missing status values: ${missingValues.map((v) => `"${v}": "${v}"`).join(', ')}.`,
            metadata: {
              objectTypeExternalId: mapping.objectTypeExternalId,
              attributeExternalId: attrMapping.attributeExternalId,
            },
          });
        }
      }
    }
  }

  return diagnostics;
}
