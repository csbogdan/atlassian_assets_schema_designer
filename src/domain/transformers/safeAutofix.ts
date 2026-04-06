import type { AssetsImportDocument, Diagnostic, ObjectAttributeDefinition, ObjectTypeDefinition, ObjectTypeMappingDefinition } from '@/domain/model/types';

const SUPPORTED_CODES = new Set([
  'SEMANTIC_MAPPING_REMOVED',
  'SEMANTIC_MAPPING_ADDED',
  'SEMANTIC_ATTRIBUTE_REMOVED',
  'SEMANTIC_ATTRIBUTE_ADDED',
]);

export function canApplySafeAutofix(diagnostic: Diagnostic): boolean {
  return SUPPORTED_CODES.has(diagnostic.code);
}

export function applySafeAutofix(
  currentDocument: AssetsImportDocument,
  baselineDocument: AssetsImportDocument,
  diagnostic: Diagnostic,
): AssetsImportDocument {
  if (!canApplySafeAutofix(diagnostic)) {
    return currentDocument;
  }

  const { objectTypeExternalId, attributeExternalId } = diagnostic.metadata ?? {};

  if (diagnostic.code === 'SEMANTIC_MAPPING_REMOVED') {
    if (!objectTypeExternalId) {
      return currentDocument;
    }

    const baselineMapping = baselineDocument.mapping.objectTypeMappings.find(
      (mapping) => mapping.objectTypeExternalId === objectTypeExternalId,
    );
    if (!baselineMapping) {
      return currentDocument;
    }

    if (currentDocument.mapping.objectTypeMappings.some((mapping) => mapping.objectTypeExternalId === objectTypeExternalId)) {
      return currentDocument;
    }

    return {
      ...currentDocument,
      mapping: {
        ...currentDocument.mapping,
        objectTypeMappings: [...currentDocument.mapping.objectTypeMappings, deepCloneMapping(baselineMapping)],
      },
    };
  }

  if (diagnostic.code === 'SEMANTIC_MAPPING_ADDED') {
    if (!objectTypeExternalId) {
      return currentDocument;
    }

    return {
      ...currentDocument,
      mapping: {
        ...currentDocument.mapping,
        objectTypeMappings: currentDocument.mapping.objectTypeMappings.filter(
          (mapping) => mapping.objectTypeExternalId !== objectTypeExternalId,
        ),
      },
    };
  }

  if (diagnostic.code === 'SEMANTIC_ATTRIBUTE_REMOVED') {
    if (!objectTypeExternalId || !attributeExternalId) {
      return currentDocument;
    }

    const baselineType = findObjectTypeByExternalId(baselineDocument.schema.objectSchema.objectTypes, objectTypeExternalId);
    const baselineAttribute = baselineType?.attributes?.find((attribute) => attribute.externalId === attributeExternalId);
    if (!baselineAttribute) {
      return currentDocument;
    }

    return {
      ...currentDocument,
      schema: {
        ...currentDocument.schema,
        objectSchema: {
          ...currentDocument.schema.objectSchema,
          objectTypes: updateObjectTypeByExternalId(
            currentDocument.schema.objectSchema.objectTypes,
            objectTypeExternalId,
            (objectType) => {
              const existing = objectType.attributes ?? [];
              if (existing.some((attribute) => attribute.externalId === attributeExternalId)) {
                return objectType;
              }
              return {
                ...objectType,
                attributes: [...existing, deepCloneAttribute(baselineAttribute)],
              };
            },
          ),
        },
      },
    };
  }

  if (diagnostic.code === 'SEMANTIC_ATTRIBUTE_ADDED') {
    if (!objectTypeExternalId || !attributeExternalId) {
      return currentDocument;
    }

    return {
      ...currentDocument,
      schema: {
        ...currentDocument.schema,
        objectSchema: {
          ...currentDocument.schema.objectSchema,
          objectTypes: updateObjectTypeByExternalId(
            currentDocument.schema.objectSchema.objectTypes,
            objectTypeExternalId,
            (objectType) => ({
              ...objectType,
              attributes: (objectType.attributes ?? []).filter(
                (attribute) => attribute.externalId !== attributeExternalId,
              ),
            }),
          ),
        },
      },
    };
  }

  return currentDocument;
}

function updateObjectTypeByExternalId(
  objectTypes: ObjectTypeDefinition[],
  externalId: string,
  updater: (objectType: ObjectTypeDefinition) => ObjectTypeDefinition,
): ObjectTypeDefinition[] {
  return objectTypes.map((objectType) => {
    if (objectType.externalId === externalId) {
      return updater(objectType);
    }

    if (!objectType.children?.length) {
      return objectType;
    }

    return {
      ...objectType,
      children: updateObjectTypeByExternalId(objectType.children, externalId, updater),
    };
  });
}

function findObjectTypeByExternalId(
  objectTypes: ObjectTypeDefinition[],
  externalId: string,
): ObjectTypeDefinition | undefined {
  for (const objectType of objectTypes) {
    if (objectType.externalId === externalId) {
      return objectType;
    }

    if (objectType.children?.length) {
      const child = findObjectTypeByExternalId(objectType.children, externalId);
      if (child) {
        return child;
      }
    }
  }

  return undefined;
}

function deepCloneMapping(mapping: ObjectTypeMappingDefinition): ObjectTypeMappingDefinition {
  return {
    ...mapping,
    attributesMapping: mapping.attributesMapping.map((attributeMapping) => ({ ...attributeMapping })),
  };
}

function deepCloneAttribute(attribute: ObjectAttributeDefinition): ObjectAttributeDefinition {
  return { ...attribute };
}
