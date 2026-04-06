import type { AssetsImportDocument, ObjectAttributeDefinition, ObjectTypeDefinition } from '@/domain/model/types';
import { flattenObjectTypes } from '@/domain/selectors/indexes';

function collectAllAttributeExternalIds(document: AssetsImportDocument): Set<string> {
  const flattened = flattenObjectTypes(document.schema.objectSchema.objectTypes);
  const ids = new Set<string>();
  for (const item of flattened) {
    for (const attribute of item.objectType.attributes ?? []) {
      ids.add(attribute.externalId);
    }
  }
  return ids;
}

function deduplicateAttributeExternalId(base: string, existingIds: Set<string>): string {
  let candidate = `${base}_copy`;
  if (!existingIds.has(candidate)) return candidate;
  let counter = 2;
  while (existingIds.has(`${base}_copy${counter}`)) {
    counter += 1;
  }
  return `${base}_copy${counter}`;
}

function cloneAttributes(
  attributes: ObjectAttributeDefinition[],
  existingIds: Set<string>,
): ObjectAttributeDefinition[] {
  return attributes.map((attribute) => {
    const newId = deduplicateAttributeExternalId(attribute.externalId, existingIds);
    existingIds.add(newId);
    return { ...attribute, externalId: newId };
  });
}

function insertSiblingInObjectTypes(
  objectTypes: ObjectTypeDefinition[],
  sourceExternalId: string,
  clone: ObjectTypeDefinition,
): { updated: ObjectTypeDefinition[]; inserted: boolean } {
  const sourceIndex = objectTypes.findIndex((ot) => ot.externalId === sourceExternalId);

  if (sourceIndex !== -1) {
    const updated = [
      ...objectTypes.slice(0, sourceIndex + 1),
      clone,
      ...objectTypes.slice(sourceIndex + 1),
    ];
    return { updated, inserted: true };
  }

  // Not found at this level — recurse into children
  const updatedTypes: ObjectTypeDefinition[] = [];
  let inserted = false;

  for (const objectType of objectTypes) {
    if (!inserted && objectType.children && objectType.children.length > 0) {
      const result = insertSiblingInObjectTypes(objectType.children, sourceExternalId, clone);
      if (result.inserted) {
        updatedTypes.push({ ...objectType, children: result.updated });
        inserted = true;
        continue;
      }
    }
    updatedTypes.push(objectType);
  }

  return { updated: updatedTypes, inserted };
}

export function cloneObjectType(
  document: AssetsImportDocument,
  sourceExternalId: string,
  newExternalId: string,
  newName: string,
): AssetsImportDocument {
  const flattened = flattenObjectTypes(document.schema.objectSchema.objectTypes);
  const sourceItem = flattened.find((item) => item.objectType.externalId === sourceExternalId);

  if (!sourceItem) {
    throw new Error(`Object type with externalId "${sourceExternalId}" not found.`);
  }

  const existingAttributeIds = collectAllAttributeExternalIds(document);
  const clonedAttributes = cloneAttributes(
    sourceItem.objectType.attributes ?? [],
    existingAttributeIds,
  );

  const clone: ObjectTypeDefinition = {
    ...sourceItem.objectType,
    externalId: newExternalId,
    name: newName,
    attributes: clonedAttributes,
    children: undefined,
  };

  // Remove `children: undefined` from clone if original didn't have it either
  if (!('children' in sourceItem.objectType)) {
    const { children: _removed, ...rest } = clone;
    void _removed;
    Object.assign(clone, rest);
  }

  const result = insertSiblingInObjectTypes(
    document.schema.objectSchema.objectTypes,
    sourceExternalId,
    clone,
  );

  return {
    ...document,
    schema: {
      ...document.schema,
      objectSchema: {
        ...document.schema.objectSchema,
        objectTypes: result.updated,
      },
    },
  };
}
