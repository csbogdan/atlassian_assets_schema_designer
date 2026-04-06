import type { FlattenedObjectType } from '@/domain/model/types';

export type ReferenceEdge = {
  sourceExternalId: string;
  targetExternalId: string;
  attributeExternalId: string;
  attributeName: string;
};

export function buildReferenceEdges(flattened: FlattenedObjectType[]): ReferenceEdge[] {
  const existingIds = new Set(flattened.map((item) => item.objectType.externalId));
  const edges: ReferenceEdge[] = [];

  for (const item of flattened) {
    for (const attr of item.effectiveAttributes) {
      if (
        attr.type === 'referenced_object' &&
        attr.referenceObjectTypeExternalId &&
        existingIds.has(attr.referenceObjectTypeExternalId)
      ) {
        edges.push({
          sourceExternalId: item.objectType.externalId,
          targetExternalId: attr.referenceObjectTypeExternalId,
          attributeExternalId: attr.externalId,
          attributeName: attr.name,
        });
      }
    }
  }

  return edges;
}
