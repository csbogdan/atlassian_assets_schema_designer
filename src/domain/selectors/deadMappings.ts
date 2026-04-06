import type { Diagnostic } from '@/domain/model/types';

export type DeadMappingIndex = {
  deadObjectTypeExternalIds: Set<string>;
  deadAttributeKeys: Set<string>; // format: `${objectTypeExternalId}::${attributeExternalId}`
};

export function buildDeadMappingIndex(diagnostics: Diagnostic[]): DeadMappingIndex {
  const deadObjectTypeExternalIds = new Set<string>();
  const deadAttributeKeys = new Set<string>();

  for (const diagnostic of diagnostics) {
    if (diagnostic.code === 'BREAKING_MAPPING_OBJECT_TYPE_MISSING') {
      const objectTypeExternalId = diagnostic.metadata?.objectTypeExternalId;
      if (objectTypeExternalId !== undefined) {
        deadObjectTypeExternalIds.add(objectTypeExternalId);
      }
    } else if (diagnostic.code === 'BREAKING_MAPPING_ATTRIBUTE_MISSING') {
      const objectTypeExternalId = diagnostic.metadata?.objectTypeExternalId;
      const attributeExternalId = diagnostic.metadata?.attributeExternalId;
      if (objectTypeExternalId !== undefined && attributeExternalId !== undefined) {
        deadAttributeKeys.add(`${objectTypeExternalId}::${attributeExternalId}`);
      }
    }
  }

  return { deadObjectTypeExternalIds, deadAttributeKeys };
}
