import type { AssetsImportDocument } from '@/domain/model/types';
import { flattenObjectTypes } from '@/domain/selectors/indexes';

export type SearchResult =
  | { kind: 'objectType'; externalId: string; name: string; jsonPath: string }
  | {
      kind: 'attribute';
      externalId: string;
      name: string;
      objectTypeExternalId: string;
      objectTypeName: string;
      attributeIndex: number;
      jsonPath: string;
    };

export function buildSearchIndex(document: AssetsImportDocument): SearchResult[] {
  const results: SearchResult[] = [];
  const flattened = flattenObjectTypes(document.schema.objectSchema.objectTypes);

  for (const item of flattened) {
    const { objectType, jsonPath } = item;

    results.push({
      kind: 'objectType',
      externalId: objectType.externalId,
      name: objectType.name,
      jsonPath,
    });

    for (const [index, attribute] of (objectType.attributes ?? []).entries()) {
      results.push({
        kind: 'attribute',
        externalId: attribute.externalId,
        name: attribute.name,
        objectTypeExternalId: objectType.externalId,
        objectTypeName: objectType.name,
        attributeIndex: index,
        jsonPath: `${jsonPath}/attributes/${index}`,
      });
    }
  }

  return results;
}
