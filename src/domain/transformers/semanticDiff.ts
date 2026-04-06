import type { AssetsImportDocument, Diagnostic } from '@/domain/model/types';
import { flattenObjectTypes } from '@/domain/selectors/indexes';

export function buildSemanticDiff(
  previousDocument: AssetsImportDocument,
  nextDocument: AssetsImportDocument,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const previousTypes = flattenObjectTypes(previousDocument.schema.objectSchema.objectTypes);
  const nextTypes = flattenObjectTypes(nextDocument.schema.objectSchema.objectTypes);

  const previousTypeIds = new Set(previousTypes.map((item) => item.objectType.externalId));
  const nextTypeIds = new Set(nextTypes.map((item) => item.objectType.externalId));

  previousTypes.forEach((item) => {
    if (!nextTypeIds.has(item.objectType.externalId)) {
      diagnostics.push({
        code: 'SEMANTIC_OBJECT_TYPE_REMOVED',
        severity: 'warning',
        message: `Object type ${item.objectType.externalId} was removed.`,
        path: item.jsonPath,
        suggestion: 'Review mapping dependencies before removing object types.',
        metadata: { objectTypeExternalId: item.objectType.externalId },
      });
    }
  });

  nextTypes.forEach((item) => {
    if (!previousTypeIds.has(item.objectType.externalId)) {
      diagnostics.push({
        code: 'SEMANTIC_OBJECT_TYPE_ADDED',
        severity: 'info',
        message: `Object type ${item.objectType.externalId} was added.`,
        path: item.jsonPath,
        suggestion: 'Add mapping entries if this new object type should be imported.',
        metadata: { objectTypeExternalId: item.objectType.externalId },
      });
    }
  });

  const previousMappings = previousDocument.mapping.objectTypeMappings;
  const nextMappings = nextDocument.mapping.objectTypeMappings;
  const previousMappingIds = new Set(previousMappings.map((item) => item.objectTypeExternalId));
  const nextMappingIds = new Set(nextMappings.map((item) => item.objectTypeExternalId));

  previousMappings.forEach((mapping, index) => {
    if (!nextMappingIds.has(mapping.objectTypeExternalId)) {
      diagnostics.push({
        code: 'SEMANTIC_MAPPING_REMOVED',
        severity: 'warning',
        message: `Mapping for ${mapping.objectTypeExternalId} was removed.`,
        path: `/mapping/objectTypeMappings/${index}`,
        suggestion: 'Safe autofix can restore this mapping from baseline.',
        metadata: { objectTypeExternalId: mapping.objectTypeExternalId },
      });
    }
  });

  nextMappings.forEach((mapping, index) => {
    if (!previousMappingIds.has(mapping.objectTypeExternalId)) {
      diagnostics.push({
        code: 'SEMANTIC_MAPPING_ADDED',
        severity: 'info',
        message: `Mapping for ${mapping.objectTypeExternalId} was added.`,
        path: `/mapping/objectTypeMappings/${index}`,
        suggestion: 'Safe autofix can remove this mapping to match baseline.',
        metadata: { objectTypeExternalId: mapping.objectTypeExternalId },
      });
    }
  });

  const previousByExternalId = new Map(previousTypes.map((item) => [item.objectType.externalId, item]));
  const nextByExternalId = new Map(nextTypes.map((item) => [item.objectType.externalId, item]));

  previousByExternalId.forEach((previousType, externalId) => {
    const nextType = nextByExternalId.get(externalId);
    if (!nextType) {
      return;
    }

    const previousAttributes = previousType.objectType.attributes ?? [];
    const nextAttributes = nextType.objectType.attributes ?? [];
    const previousAttrIds = new Set(previousAttributes.map((attribute) => attribute.externalId));
    const nextAttrIds = new Set(nextAttributes.map((attribute) => attribute.externalId));

    previousAttributes.forEach((attribute, index) => {
      if (!nextAttrIds.has(attribute.externalId)) {
        diagnostics.push({
          code: 'SEMANTIC_ATTRIBUTE_REMOVED',
          severity: 'warning',
          message: `Attribute ${attribute.externalId} was removed from ${externalId}.`,
          path: `${previousType.jsonPath}/attributes/${index}`,
          suggestion: 'Safe autofix can restore this attribute from baseline.',
          metadata: { objectTypeExternalId: externalId, attributeExternalId: attribute.externalId },
        });
      }
    });

    nextAttributes.forEach((attribute, index) => {
      if (!previousAttrIds.has(attribute.externalId)) {
        diagnostics.push({
          code: 'SEMANTIC_ATTRIBUTE_ADDED',
          severity: 'info',
          message: `Attribute ${attribute.externalId} was added to ${externalId}.`,
          path: `${nextType.jsonPath}/attributes/${index}`,
          suggestion: 'Safe autofix can remove this attribute to match baseline.',
          metadata: { objectTypeExternalId: externalId, attributeExternalId: attribute.externalId },
        });
      }
    });
  });

  return diagnostics;
}
