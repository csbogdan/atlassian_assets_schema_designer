import type {
  AssetsImportDocument,
  ObjectAttributeDefinition,
  ObjectTypeDefinition,
} from '@/domain/model/types';

// ── helpers ───────────────────────────────────────────────────────────────────

/** Recursively collect the externalId of a node and all its descendants. */
function collectAllIds(node: ObjectTypeDefinition, into: Set<string>): void {
  into.add(node.externalId);
  for (const child of node.children ?? []) {
    collectAllIds(child, into);
  }
}

/**
 * Return the externalIds of `rootExternalId` and every one of its descendants.
 * Returns an empty Set if the id is not found in the tree.
 */
export function collectSubtreeIds(
  types: ObjectTypeDefinition[],
  rootExternalId: string,
): Set<string> {
  const result = new Set<string>();

  function walk(nodes: ObjectTypeDefinition[]): boolean {
    for (const node of nodes) {
      if (node.externalId === rootExternalId) {
        collectAllIds(node, result);
        return true;
      }
      if (walk(node.children ?? [])) return true;
    }
    return false;
  }

  walk(types);
  return result;
}

/** Strip `referenced_object` attributes that point to any staged type. */
function filterCrossRefAttributes(
  attrs: ObjectAttributeDefinition[],
  stagedIds: ReadonlySet<string>,
): ObjectAttributeDefinition[] {
  return attrs.filter(
    (attr) =>
      !(
        attr.type === 'referenced_object' &&
        attr.referenceObjectTypeExternalId &&
        stagedIds.has(attr.referenceObjectTypeExternalId)
      ),
  );
}

/** Remove staged types from the tree and strip cross-ref attributes inside survivors. */
function filterTypes(
  types: ObjectTypeDefinition[],
  stagedIds: ReadonlySet<string>,
): ObjectTypeDefinition[] {
  return types
    .filter((t) => !stagedIds.has(t.externalId))
    .map((t) => ({
      ...t,
      attributes: filterCrossRefAttributes(t.attributes ?? [], stagedIds),
      children: filterTypes(t.children ?? [], stagedIds),
    }));
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Return a clean `AssetsImportDocument` with all staged types excised:
 *
 * 1. Staged object types (and their full subtrees) removed from the schema tree.
 * 2. Their `objectTypeMappings` entries removed.
 * 3. `referenced_object` attributes in surviving types that point to staged types removed.
 * 4. Attribute mapping entries for those removed cross-ref attributes removed.
 *
 * The original document is never mutated.
 */
export function applyStaging(
  document: AssetsImportDocument,
  stagedIds: ReadonlySet<string> | string[],
): AssetsImportDocument {
  const staged: ReadonlySet<string> =
    stagedIds instanceof Set ? stagedIds : new Set(stagedIds);

  if (staged.size === 0) return document;

  // 1. Filter schema tree
  const filteredTypes = filterTypes(
    document.schema.objectSchema.objectTypes,
    staged,
  );

  // 2. Build surviving-attribute index (per object type) for step 4
  const survivingAttrsByType = new Map<string, Set<string>>();
  function indexSurviving(types: ObjectTypeDefinition[]): void {
    for (const t of types) {
      survivingAttrsByType.set(
        t.externalId,
        new Set((t.attributes ?? []).map((a) => a.externalId)),
      );
      indexSurviving(t.children ?? []);
    }
  }
  indexSurviving(filteredTypes);

  // 3 + 4. Filter mappings (drop staged types; drop orphaned attribute mappings)
  const filteredMappings = document.mapping.objectTypeMappings
    .filter((m) => !staged.has(m.objectTypeExternalId))
    .map((m) => {
      const surviving = survivingAttrsByType.get(m.objectTypeExternalId);
      if (!surviving) return m;
      const nextAttrs = m.attributesMapping.filter((am) =>
        surviving.has(am.attributeExternalId),
      );
      if (nextAttrs.length === m.attributesMapping.length) return m;
      return { ...m, attributesMapping: nextAttrs };
    });

  return {
    ...document,
    schema: {
      ...document.schema,
      objectSchema: {
        ...document.schema.objectSchema,
        objectTypes: filteredTypes,
      },
    },
    mapping: {
      ...document.mapping,
      objectTypeMappings: filteredMappings,
    },
  };
}
