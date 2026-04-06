import type { AssetsImportDocument, ObjectAttributeDefinition, ObjectTypeDefinition } from '@/domain/model/types';

export type BulkAddResult = {
  document: AssetsImportDocument;
  skippedExternalIds: string[]; // types that already had this attributeExternalId
};

function walkAndAdd(
  objectTypes: ObjectTypeDefinition[],
  targetSet: Set<string>,
  attribute: ObjectAttributeDefinition,
  skipped: string[],
): ObjectTypeDefinition[] {
  return objectTypes.map((objectType) => {
    const withUpdatedChildren: ObjectTypeDefinition = {
      ...objectType,
      children: objectType.children
        ? walkAndAdd(objectType.children, targetSet, attribute, skipped)
        : undefined,
    };

    if (!targetSet.has(objectType.externalId)) {
      return withUpdatedChildren;
    }

    const existing = (objectType.attributes ?? []).some(
      (a) => a.externalId === attribute.externalId,
    );

    if (existing) {
      skipped.push(objectType.externalId);
      return withUpdatedChildren;
    }

    return {
      ...withUpdatedChildren,
      attributes: [...(objectType.attributes ?? []), { ...attribute }],
    };
  });
}

export function bulkAddAttribute(
  document: AssetsImportDocument,
  targetObjectTypeExternalIds: string[],
  attribute: ObjectAttributeDefinition,
): BulkAddResult {
  const targetSet = new Set(targetObjectTypeExternalIds);
  const skippedExternalIds: string[] = [];

  const updatedObjectTypes = walkAndAdd(
    document.schema.objectSchema.objectTypes,
    targetSet,
    attribute,
    skippedExternalIds,
  );

  return {
    document: {
      ...document,
      schema: {
        ...document.schema,
        objectSchema: {
          ...document.schema.objectSchema,
          objectTypes: updatedObjectTypes,
        },
      },
    },
    skippedExternalIds,
  };
}
