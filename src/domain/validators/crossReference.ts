import type { AssetsImportDocument, Diagnostic } from '@/domain/model/types';
import { buildIndexes } from '@/domain/selectors/indexes';

export function validateCrossReferences(document: AssetsImportDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const indexes = buildIndexes(document);

  document.mapping.objectTypeMappings.forEach((mapping, mappingIndex) => {
    const flattened = indexes.objectTypesByExternalId.get(mapping.objectTypeExternalId);

    if (!flattened) {
      diagnostics.push({
        code: 'BREAKING_MAPPING_OBJECT_TYPE_MISSING',
        severity: 'error',
        message: `Mapping references unknown object type externalId ${mapping.objectTypeExternalId}.`,
        path: `/mapping/objectTypeMappings/${mappingIndex}/objectTypeExternalId`,
        suggestion: 'Update objectTypeExternalId to an existing schema object type, or remove this mapping entry.',
      });
      return;
    }

    if (mapping.objectTypeName && mapping.objectTypeName !== flattened.objectType.name) {
      diagnostics.push({
        code: 'MAPPING_OBJECT_TYPE_NAME_MISMATCH',
        severity: 'warning',
        message: `Mapping object type name ${mapping.objectTypeName} differs from schema name ${flattened.objectType.name}.`,
        path: `/mapping/objectTypeMappings/${mappingIndex}/objectTypeName`,
        relatedPaths: [flattened.jsonPath],
        suggestion: 'Sync mapping objectTypeName with the schema object type name.',
      });
    }

    const effectiveAttributes = flattened.attributeLookup;
    const externalIdParts = mapping.attributesMapping.filter((attribute) => attribute.externalIdPart);

    if (externalIdParts.length === 0) {
      diagnostics.push({
        code: 'MAPPING_EXTERNAL_ID_PART_MISSING',
        severity: 'warning',
        message: `Mapping for ${mapping.objectTypeExternalId} has no attribute marked as externalIdPart.`,
        path: `/mapping/objectTypeMappings/${mappingIndex}/attributesMapping`,
        suggestion: 'Mark one stable identifier attribute as externalIdPart=true (usually the primary key attribute).',
      });
    }

    mapping.attributesMapping.forEach((attributeMapping, attributeIndex) => {
      const attributeEntry = effectiveAttributes.get(attributeMapping.attributeExternalId);
      const basePath = `/mapping/objectTypeMappings/${mappingIndex}/attributesMapping/${attributeIndex}`;

      if (!attributeEntry) {
        diagnostics.push({
          code: 'BREAKING_MAPPING_ATTRIBUTE_MISSING',
          severity: 'error',
          message: `Attribute mapping references unknown attribute externalId ${attributeMapping.attributeExternalId}.`,
          path: `${basePath}/attributeExternalId`,
          suggestion: 'Change attributeExternalId to a valid schema attribute, or remove this attribute mapping row.',
        });
        return;
      }

      const attribute = attributeEntry.attribute;

      if (attributeMapping.attributeName && attributeMapping.attributeName !== attribute.name) {
        diagnostics.push({
          code: 'MAPPING_ATTRIBUTE_NAME_MISMATCH',
          severity: 'warning',
          message: `Attribute mapping name ${attributeMapping.attributeName} differs from schema attribute name ${attribute.name}.`,
          path: `${basePath}/attributeName`,
          relatedPaths: [attributeEntry.path],
          suggestion: 'Sync attributeName with the schema attribute name for consistency.',
        });
      }

      if (attribute.type === 'referenced_object' && !attributeMapping.objectMappingIQL) {
        diagnostics.push({
          code: 'REFERENCED_OBJECT_MAPPING_IQL_MISSING',
          severity: 'warning',
          message: `Referenced object attribute ${attribute.externalId} should define objectMappingIQL.`,
          path: basePath,
          suggestion: 'Define objectMappingIQL to resolve referenced objects (for example by externalId lookup).',
        });
      }
    });
  });

  return diagnostics;
}
