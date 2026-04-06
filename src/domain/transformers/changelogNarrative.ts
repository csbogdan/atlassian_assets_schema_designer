import type { AssetsImportDocument, ObjectAttributeDefinition } from '@/domain/model/types';
import { flattenObjectTypes } from '@/domain/selectors/indexes';

export type ChangelogEntry = {
  objectTypeExternalId: string;
  objectTypeName: string;
  changes: string[]; // English sentences
};

export type Changelog = {
  entries: ChangelogEntry[];
  addedObjectTypes: string[]; // externalIds
  removedObjectTypes: string[]; // externalIds
  summary: string;
};

export function buildChangelogNarrative(
  previousDocument: AssetsImportDocument,
  nextDocument: AssetsImportDocument,
): Changelog {
  const previousFlattened = flattenObjectTypes(previousDocument.schema.objectSchema.objectTypes);
  const nextFlattened = flattenObjectTypes(nextDocument.schema.objectSchema.objectTypes);

  const previousById = new Map(previousFlattened.map((item) => [item.objectType.externalId, item]));
  const nextById = new Map(nextFlattened.map((item) => [item.objectType.externalId, item]));

  const addedObjectTypes: string[] = [];
  const removedObjectTypes: string[] = [];
  const entries: ChangelogEntry[] = [];

  // Detect removed types
  for (const [externalId] of previousById) {
    if (!nextById.has(externalId)) {
      removedObjectTypes.push(externalId);
    }
  }

  // Detect added types
  for (const [externalId] of nextById) {
    if (!previousById.has(externalId)) {
      addedObjectTypes.push(externalId);
    }
  }

  // Per-type pairwise comparison for matched types
  for (const [externalId, previousItem] of previousById) {
    const nextItem = nextById.get(externalId);
    if (!nextItem) continue;

    const changes: string[] = [];
    const previousType = previousItem.objectType;
    const nextType = nextItem.objectType;

    // Name change
    if (previousType.name !== nextType.name) {
      changes.push(`Renamed object type from "${previousType.name}" to "${nextType.name}".`);
    }

    const previousAttrs: ObjectAttributeDefinition[] = previousType.attributes ?? [];
    const nextAttrs: ObjectAttributeDefinition[] = nextType.attributes ?? [];

    const previousAttrById = new Map(previousAttrs.map((a) => [a.externalId, a]));
    const nextAttrById = new Map(nextAttrs.map((a) => [a.externalId, a]));

    // Detect renames: attribute removed by externalId but new one appears at same array index
    const removedByIndex = new Map<number, ObjectAttributeDefinition>();
    const addedByIndex = new Map<number, ObjectAttributeDefinition>();

    for (const [index, attr] of previousAttrs.entries()) {
      if (!nextAttrById.has(attr.externalId)) {
        removedByIndex.set(index, attr);
      }
    }

    for (const [index, attr] of nextAttrs.entries()) {
      if (!previousAttrById.has(attr.externalId)) {
        addedByIndex.set(index, attr);
      }
    }

    const renamedNewExternalIds = new Set<string>();
    const renamedOldExternalIds = new Set<string>();

    for (const [index, oldAttr] of removedByIndex) {
      const newAttr = addedByIndex.get(index);
      if (newAttr) {
        changes.push(`Renamed attribute \`${oldAttr.name}\` (${oldAttr.externalId}) to \`${newAttr.name}\` (${newAttr.externalId}).`);
        renamedOldExternalIds.add(oldAttr.externalId);
        renamedNewExternalIds.add(newAttr.externalId);
      }
    }

    // Removed attributes (not renames)
    for (const attr of previousAttrs) {
      if (!nextAttrById.has(attr.externalId) && !renamedOldExternalIds.has(attr.externalId)) {
        changes.push(`Removed attribute \`${attr.name}\` (${attr.externalId}).`);
      }
    }

    // Added attributes (not renames)
    for (const attr of nextAttrs) {
      if (!previousAttrById.has(attr.externalId) && !renamedNewExternalIds.has(attr.externalId)) {
        changes.push(`Added attribute \`${attr.name}\` (${attr.externalId}).`);
      }
    }

    // Changed attribute name or type (same externalId)
    for (const attr of nextAttrs) {
      const prev = previousAttrById.get(attr.externalId);
      if (!prev) continue;
      if (prev.name !== attr.name) {
        changes.push(`Renamed attribute \`${prev.name}\` to \`${attr.name}\`.`);
      }
      if (prev.type !== attr.type) {
        changes.push(
          `Changed type of \`${attr.name}\` from \`${prev.type}\` to \`${attr.type}\`.`,
        );
      }
    }

    if (changes.length > 0) {
      entries.push({
        objectTypeExternalId: externalId,
        objectTypeName: nextType.name,
        changes,
      });
    }
  }

  // Build summary
  const changedCount = entries.length;
  const addedCount = addedObjectTypes.length;
  const removedCount = removedObjectTypes.length;

  const totalRenames = entries.reduce(
    (sum, entry) => sum + entry.changes.filter((c) => c.startsWith('Renamed attribute')).length,
    0,
  );

  const parts: string[] = [];
  if (changedCount > 0) parts.push(`${changedCount} type${changedCount === 1 ? '' : 's'} changed`);
  if (addedCount > 0) parts.push(`${addedCount} added`);
  if (removedCount > 0) parts.push(`${removedCount} removed`);
  if (totalRenames > 0)
    parts.push(`${totalRenames} attribute${totalRenames === 1 ? '' : 's'} renamed`);

  const summary = parts.length > 0 ? parts.join(', ') : 'No changes detected';

  return {
    entries,
    addedObjectTypes,
    removedObjectTypes,
    summary,
  };
}
