import type { AssetsImportDocument } from '@/domain/model/types';
import { buildIndexes, flattenObjectTypes } from '@/domain/selectors/indexes';

export type AttributeCompleteness = {
  attributeExternalId: string;
  attributeName: string;
  isMapped: boolean;
  locatorsCount: number;
};

export type ObjectTypeMappingCompleteness = {
  objectTypeExternalId: string;
  objectTypeName: string;
  hasMapping: boolean;
  totalAttributes: number;
  mappedAttributes: number;
  unmappedAttributes: number;
  coveragePercent: number; // 0-100
  attributes: AttributeCompleteness[];
};

export function computeMappingCompleteness(
  document: AssetsImportDocument,
): ObjectTypeMappingCompleteness[] {
  const flattened = flattenObjectTypes(document.schema.objectSchema.objectTypes);
  const indexes = buildIndexes(document);

  return flattened.map((item) => {
    const { objectType } = item;
    const mapping = indexes.mappingsByObjectTypeExternalId.get(objectType.externalId);
    const hasMapping = mapping !== undefined;

    const attributeMappingByExternalId = new Map(
      (mapping?.attributesMapping ?? []).map((am) => [am.attributeExternalId, am]),
    );

    const effectiveAttributes = item.effectiveAttributes;
    let mappedAttributes = 0;

    const attributes: AttributeCompleteness[] = effectiveAttributes.map((attribute) => {
      const attrMapping = attributeMappingByExternalId.get(attribute.externalId);
      const locatorsCount = attrMapping?.attributeLocators?.length ?? 0;
      const isMapped = attrMapping !== undefined && locatorsCount > 0;

      if (isMapped) {
        mappedAttributes += 1;
      }

      return {
        attributeExternalId: attribute.externalId,
        attributeName: attribute.name,
        isMapped,
        locatorsCount,
      };
    });

    const totalAttributes = effectiveAttributes.length;
    const unmappedAttributes = totalAttributes - mappedAttributes;
    const coveragePercent =
      totalAttributes === 0
        ? 0
        : Math.round((mappedAttributes / totalAttributes) * 1000) / 10;

    return {
      objectTypeExternalId: objectType.externalId,
      objectTypeName: objectType.name,
      hasMapping,
      totalAttributes,
      mappedAttributes,
      unmappedAttributes,
      coveragePercent,
      attributes,
    };
  });
}
