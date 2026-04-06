import type { AssetsImportDocument, DocumentIndexes, FlattenedObjectType, ObjectAttributeDefinition, ObjectTypeDefinition } from '@/domain/model/types';

function mergeAttributes(
  inherited: ObjectAttributeDefinition[],
  local: ObjectAttributeDefinition[],
): ObjectAttributeDefinition[] {
  const seen = new Map<string, ObjectAttributeDefinition>();
  for (const attribute of inherited) {
    seen.set(attribute.externalId, attribute);
  }
  for (const attribute of local) {
    seen.set(attribute.externalId, attribute);
  }
  return Array.from(seen.values());
}

function buildAttributeLookup(
  attributes: ObjectAttributeDefinition[],
  basePath: string,
): Map<string, { attribute: ObjectAttributeDefinition; path: string }> {
  const lookup = new Map<string, { attribute: ObjectAttributeDefinition; path: string }>();
  attributes.forEach((attribute, index) => {
    lookup.set(attribute.externalId, {
      attribute,
      path: `${basePath}/${index}`,
    });
  });
  return lookup;
}

export function flattenObjectTypes(
  objectTypes: ObjectTypeDefinition[],
  parent?: FlattenedObjectType,
  basePath = '/schema/objectSchema/objectTypes',
): FlattenedObjectType[] {
  return objectTypes.flatMap((objectType, index) => {
    const jsonPath = `${basePath}/${index}`;
    const inherits = Boolean(objectType.inheritance && parent);
    const inheritedAttributes = inherits && parent ? parent.effectiveAttributes : [];
    const localAttributes = objectType.attributes ?? [];
    const effectiveAttributes = mergeAttributes(inheritedAttributes, localAttributes);
    const inheritedLookup = inherits && parent ? parent.attributeLookup : new Map();
    const localLookup = buildAttributeLookup(localAttributes, `${jsonPath}/attributes`);
    const attributeLookup = new Map(inheritedLookup);

    for (const [externalId, entry] of localLookup.entries()) {
      attributeLookup.set(externalId, entry);
    }

    const current: FlattenedObjectType = {
      objectType,
      parentExternalId: parent?.objectType.externalId,
      path: parent ? `${parent.path}/${objectType.externalId}` : objectType.externalId,
      jsonPath,
      depth: parent ? parent.depth + 1 : 0,
      inheritedAttributes,
      effectiveAttributes,
      attributeLookup,
    };

    return [
      current,
      ...flattenObjectTypes(objectType.children ?? [], current, `${jsonPath}/children`),
    ];
  });
}

export function buildIndexes(document: AssetsImportDocument): DocumentIndexes {
  const flattened = flattenObjectTypes(document.schema.objectSchema.objectTypes);
  return {
    objectTypesByExternalId: new Map(flattened.map((item) => [item.objectType.externalId, item])),
    mappingsByObjectTypeExternalId: new Map(document.mapping.objectTypeMappings.map((item) => [item.objectTypeExternalId, item])),
  };
}
