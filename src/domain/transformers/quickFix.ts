import type { AssetsImportDocument, Diagnostic, ObjectTypeDefinition } from '@/domain/model/types';
import { flattenObjectTypes } from '@/domain/selectors/indexes';

const AUTO_APPLY_CODES = new Set([
  'MAPPING_OBJECT_TYPE_NAME_MISMATCH',
  'MAPPING_ATTRIBUTE_NAME_MISMATCH',
  'MAPPING_EXTERNAL_ID_PART_MISSING',
  'REFERENCED_OBJECT_MAPPING_IQL_MISSING',
  'BREAKING_MAPPING_ATTRIBUTE_MISSING',
  'BREAKING_MAPPING_OBJECT_TYPE_MISSING',
]);

export function canAutoApplyQuickFix(diagnostic: Diagnostic): boolean {
  return AUTO_APPLY_CODES.has(diagnostic.code);
}

/** Returns true if the diagnostic supports the "Drop & recreate" guided action. */
export function canDropAndRecreate(diagnostic: Diagnostic): boolean {
  return diagnostic.code === 'BREAKING_ATTRIBUTE_TYPE_CHANGED' &&
    Boolean(diagnostic.metadata?.objectTypeExternalId) &&
    Boolean(diagnostic.metadata?.attributeExternalId) &&
    Boolean(diagnostic.metadata?.previousType);
}

/**
 * Applies the "Drop & recreate" fix for BREAKING_ATTRIBUTE_TYPE_CHANGED:
 * - Reverts the original attribute's type to the baseline type (previousType).
 * - Adds a pre-filled stub attribute with the intended new type at the end of the list.
 *   The stub has an empty externalId — the user must fill it in.
 */
export function applyDropAndRecreate(document: AssetsImportDocument, diagnostic: Diagnostic): AssetsImportDocument {
  const { objectTypeExternalId, attributeExternalId, previousType } = diagnostic.metadata ?? {};
  if (!objectTypeExternalId || !attributeExternalId || !previousType) return document;

  const flattened = flattenObjectTypes(document.schema.objectSchema.objectTypes);
  const targetItem = flattened.find((item) => item.objectType.externalId === objectTypeExternalId);
  if (!targetItem) return document;

  const currentAttr = targetItem.objectType.attributes?.find((a) => a.externalId === attributeExternalId);
  if (!currentAttr) return document;

  const intendedType = currentAttr.type; // what the user changed it to

  const newObjectTypes = mapObjectTypes(document.schema.objectSchema.objectTypes, (objectType) => {
    if (objectType.externalId !== objectTypeExternalId) return objectType;

    const attrs = objectType.attributes ?? [];

    // Revert the changed attribute to its baseline type
    const reverted = attrs.map((attr) =>
      attr.externalId === attributeExternalId ? { ...attr, type: previousType } : attr,
    );

    // Add a pre-filled stub with the intended type; externalId left empty for user to fill
    const stub = {
      externalId: '',
      name: currentAttr.name,
      type: intendedType,
      label: false,
    };

    return { ...objectType, attributes: [...reverted, stub] };
  });

  return {
    ...document,
    schema: {
      ...document.schema,
      objectSchema: {
        ...document.schema.objectSchema,
        objectTypes: newObjectTypes,
      },
    },
  };
}

export function applyQuickFix(document: AssetsImportDocument, diagnostic: Diagnostic): AssetsImportDocument {
  const segments = parsePointer(diagnostic.path);
  const mappingIndex = segments[0] === 'mapping' && segments[1] === 'objectTypeMappings'
    ? Number(segments[2])
    : Number.NaN;

  if (Number.isNaN(mappingIndex)) {
    return document;
  }

  if (diagnostic.code === 'BREAKING_MAPPING_OBJECT_TYPE_MISSING') {
    return {
      ...document,
      mapping: {
        ...document.mapping,
        objectTypeMappings: document.mapping.objectTypeMappings.filter((_, index) => index !== mappingIndex),
      },
    };
  }

  const mapping = document.mapping.objectTypeMappings[mappingIndex];
  if (!mapping) {
    return document;
  }

  const flattened = flattenObjectTypes(document.schema.objectSchema.objectTypes);
  const schemaObject = flattened.find((item) => item.objectType.externalId === mapping.objectTypeExternalId);
  const attributeIndex = segments[3] === 'attributesMapping' ? Number(segments[4]) : Number.NaN;

  const nextMappings = document.mapping.objectTypeMappings.map((item, index) => {
    if (index !== mappingIndex) {
      return item;
    }

    if (diagnostic.code === 'MAPPING_OBJECT_TYPE_NAME_MISMATCH' && schemaObject) {
      return {
        ...item,
        objectTypeName: schemaObject.objectType.name,
      };
    }

    if (diagnostic.code === 'MAPPING_EXTERNAL_ID_PART_MISSING' && item.attributesMapping.length > 0) {
      return {
        ...item,
        attributesMapping: item.attributesMapping.map((attributeMapping, indexInMapping) => ({
          ...attributeMapping,
          externalIdPart: indexInMapping === 0,
        })),
      };
    }

    if (diagnostic.code === 'BREAKING_MAPPING_ATTRIBUTE_MISSING' && !Number.isNaN(attributeIndex)) {
      return {
        ...item,
        attributesMapping: item.attributesMapping.filter((_, indexInMapping) => indexInMapping !== attributeIndex),
      };
    }

    if (
      (diagnostic.code === 'MAPPING_ATTRIBUTE_NAME_MISMATCH' || diagnostic.code === 'REFERENCED_OBJECT_MAPPING_IQL_MISSING')
      && !Number.isNaN(attributeIndex)
    ) {
      const targetAttribute = item.attributesMapping[attributeIndex];
      if (!targetAttribute) {
        return item;
      }

      const schemaAttribute = schemaObject?.attributeLookup.get(targetAttribute.attributeExternalId)?.attribute;

      return {
        ...item,
        attributesMapping: item.attributesMapping.map((attributeMapping, indexInMapping) => {
          if (indexInMapping !== attributeIndex) {
            return attributeMapping;
          }

          if (diagnostic.code === 'MAPPING_ATTRIBUTE_NAME_MISMATCH' && schemaAttribute) {
            return { ...attributeMapping, attributeName: schemaAttribute.name };
          }

          if (diagnostic.code === 'REFERENCED_OBJECT_MAPPING_IQL_MISSING') {
            return {
              ...attributeMapping,
              objectMappingIQL: attributeMapping.objectMappingIQL?.trim()
                ? attributeMapping.objectMappingIQL
                : 'externalId = ${value}',
            };
          }

          return attributeMapping;
        }),
      };
    }

    return item;
  });

  return {
    ...document,
    mapping: {
      ...document.mapping,
      objectTypeMappings: nextMappings,
    },
  };
}

function parsePointer(path: string): string[] {
  return path
    .split('/')
    .slice(1)
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function mapObjectTypes(
  objectTypes: ObjectTypeDefinition[],
  transform: (objectType: ObjectTypeDefinition) => ObjectTypeDefinition,
): ObjectTypeDefinition[] {
  return objectTypes.map((objectType) => {
    const transformed = transform(objectType);
    return {
      ...transformed,
      children: transformed.children ? mapObjectTypes(transformed.children, transform) : transformed.children,
    };
  });
}
