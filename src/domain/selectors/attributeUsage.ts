import type { AssetsImportDocument } from '@/domain/model/types';
import { buildIndexes, flattenObjectTypes } from '@/domain/selectors/indexes';

export type AttributeUsageReport = {
  attributeExternalId: string;
  objectTypes: Array<{
    externalId: string;
    name: string;
    jsonPath: string;
    isInherited: boolean;
  }>;
  mappings: Array<{
    objectTypeExternalId: string;
    attributeLocators: string[];
    externalIdPart: boolean;
    objectMappingIQL?: string;
  }>;
};

export function buildAttributeUsageReport(
  document: AssetsImportDocument,
  attributeExternalId: string,
): AttributeUsageReport {
  const flattened = flattenObjectTypes(document.schema.objectSchema.objectTypes);
  const indexes = buildIndexes(document);

  const objectTypes: AttributeUsageReport['objectTypes'] = [];

  for (const item of flattened) {
    const isLocal = (item.objectType.attributes ?? []).some(
      (a) => a.externalId === attributeExternalId,
    );
    const isInherited = item.inheritedAttributes.some(
      (a) => a.externalId === attributeExternalId,
    );

    if (isLocal || isInherited) {
      objectTypes.push({
        externalId: item.objectType.externalId,
        name: item.objectType.name,
        jsonPath: item.jsonPath,
        isInherited: !isLocal && isInherited,
      });
    }
  }

  const mappings: AttributeUsageReport['mappings'] = [];

  for (const [, mapping] of indexes.mappingsByObjectTypeExternalId) {
    for (const attrMapping of mapping.attributesMapping) {
      if (attrMapping.attributeExternalId === attributeExternalId) {
        mappings.push({
          objectTypeExternalId: mapping.objectTypeExternalId,
          attributeLocators: attrMapping.attributeLocators ?? [],
          externalIdPart: attrMapping.externalIdPart ?? false,
          objectMappingIQL: attrMapping.objectMappingIQL,
        });
      }
    }
  }

  return {
    attributeExternalId,
    objectTypes,
    mappings,
  };
}
