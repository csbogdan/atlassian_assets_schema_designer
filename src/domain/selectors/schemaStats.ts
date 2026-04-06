import type { AssetsImportDocument } from '@/domain/model/types';
import { buildIndexes, flattenObjectTypes } from '@/domain/selectors/indexes';

export type SchemaStats = {
  objectTypeCount: number;
  attributeCountByType: Record<string, number>;
  inheritanceDepthDistribution: Record<number, number>; // depth -> count
  mappedObjectTypeCount: number;
  unmappedObjectTypeCount: number;
  mappingCoveragePercent: number; // 0-100, rounded to 1 decimal
  totalAttributeCount: number;
  typesWithNoAttributes: number;
};

export function computeSchemaStats(document: AssetsImportDocument): SchemaStats {
  const flattened = flattenObjectTypes(document.schema.objectSchema.objectTypes);
  const indexes = buildIndexes(document);

  const objectTypeCount = flattened.length;
  const attributeCountByType: Record<string, number> = {};
  const inheritanceDepthDistribution: Record<number, number> = {};
  let totalAttributeCount = 0;
  let typesWithNoAttributes = 0;
  let mappedObjectTypeCount = 0;

  for (const item of flattened) {
    const localAttributes = item.objectType.attributes ?? [];
    const attrCount = localAttributes.length;
    totalAttributeCount += attrCount;

    if (attrCount === 0) {
      typesWithNoAttributes += 1;
    }

    for (const attribute of localAttributes) {
      attributeCountByType[attribute.type] = (attributeCountByType[attribute.type] ?? 0) + 1;
    }

    const depth = item.depth;
    inheritanceDepthDistribution[depth] = (inheritanceDepthDistribution[depth] ?? 0) + 1;

    if (indexes.mappingsByObjectTypeExternalId.has(item.objectType.externalId)) {
      mappedObjectTypeCount += 1;
    }
  }

  const unmappedObjectTypeCount = objectTypeCount - mappedObjectTypeCount;
  const mappingCoveragePercent =
    objectTypeCount === 0
      ? 0
      : Math.round((mappedObjectTypeCount / objectTypeCount) * 1000) / 10;

  return {
    objectTypeCount,
    attributeCountByType,
    inheritanceDepthDistribution,
    mappedObjectTypeCount,
    unmappedObjectTypeCount,
    mappingCoveragePercent,
    totalAttributeCount,
    typesWithNoAttributes,
  };
}
