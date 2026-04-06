import type {
  AssetsImportDocument,
  AttributeMappingDefinition,
  ObjectAttributeDefinition,
  ObjectTypeDefinition,
} from '@/domain/model/types';

export type MoveAttributesResult = {
  document: AssetsImportDocument;
  movedCount: number;
  /** Attribute externalIds that already existed on the destination (skipped). */
  skippedDuplicates: string[];
  mappingSourceRemoved: number;
  mappingDestAdded: number;
  /** Map of old externalId → new externalId for attributes that were renamed. */
  renames: Record<string, string>;
};

// ── rename heuristic ──────────────────────────────────────────────────────────

/**
 * Tries to rename an attribute's externalId by detecting which hyphen-delimited
 * suffix of the source type's externalId forms a prefix of the attribute ID,
 * then replaces it with the matching suffix of the destination type's externalId.
 *
 * This handles cases where object types carry a schema prefix (e.g. "cmdb-")
 * that attributes omit:
 *   source "cmdb-technical-services", attr "technical-services-cname", dest "cmdb-switch"
 *   → tries full id first, then "technical-services" → matches → "switch-cname"
 *
 * Also handles the straightforward case:
 *   source "infrastructure-services", attr "infrastructure-services-ip-address", dest "network"
 *   → "network-ip-address"
 */
function deriveRename(
  attrExternalId: string,
  sourceTypeId: string,
  destTypeId: string,
): string | null {
  const sourceParts = sourceTypeId.split('-');
  const destParts = destTypeId.split('-');

  for (let i = 0; i < sourceParts.length; i++) {
    const sourcePrefix = sourceParts.slice(i).join('-');
    // Use the corresponding suffix of destTypeId at the same offset (capped to length)
    const destOffset = Math.min(i, destParts.length - 1);
    const destPrefix = destParts.slice(destOffset).join('-');

    if (attrExternalId.startsWith(sourcePrefix + '-')) {
      const suffix = attrExternalId.slice(sourcePrefix.length + 1);
      return destPrefix + '-' + suffix;
    }
    if (attrExternalId === sourcePrefix) {
      return destPrefix;
    }
  }

  return null;
}

export { deriveRename };

// ── tree helpers ──────────────────────────────────────────────────────────────

function removeFromSource(
  objectTypes: ObjectTypeDefinition[],
  sourceId: string,
  attrIds: Set<string>,
  collected: ObjectAttributeDefinition[],
): ObjectTypeDefinition[] {
  return objectTypes.map((ot) => {
    const children = ot.children
      ? removeFromSource(ot.children, sourceId, attrIds, collected)
      : undefined;

    if (ot.externalId !== sourceId) return { ...ot, children };

    const kept: ObjectAttributeDefinition[] = [];
    for (const attr of ot.attributes ?? []) {
      if (attrIds.has(attr.externalId)) {
        collected.push(attr);
      } else {
        kept.push(attr);
      }
    }
    return { ...ot, children, attributes: kept };
  });
}

function addToDestination(
  objectTypes: ObjectTypeDefinition[],
  destId: string,
  attrs: ObjectAttributeDefinition[],
  renames: Record<string, string>,
  skipped: string[],
): ObjectTypeDefinition[] {
  return objectTypes.map((ot) => {
    const children = ot.children
      ? addToDestination(ot.children, destId, attrs, renames, skipped)
      : undefined;

    if (ot.externalId !== destId) return { ...ot, children };

    const destExistingIds = new Set((ot.attributes ?? []).map((a) => a.externalId));
    const toAdd: ObjectAttributeDefinition[] = [];
    for (const attr of attrs) {
      const resolvedId = renames[attr.externalId] ?? attr.externalId;
      if (destExistingIds.has(resolvedId)) {
        skipped.push(attr.externalId);
      } else {
        toAdd.push({ ...attr, externalId: resolvedId });
      }
    }
    return { ...ot, children, attributes: [...(ot.attributes ?? []), ...toAdd] };
  });
}

// ── mapping helpers ───────────────────────────────────────────────────────────

function updateMappings(
  mappings: ReturnType<typeof Array.prototype.slice>,
  sourceId: string,
  destId: string,
  attrIds: Set<string>,
  renames: Record<string, string>,
  result: { sourceRemoved: number; destAdded: number },
): typeof mappings {
  // Pass 1: remove from source, collect (applying renames to attributeExternalId)
  const movedMappings: AttributeMappingDefinition[] = [];
  const afterSource = mappings.map(
    (m: { objectTypeExternalId: string; attributesMapping: AttributeMappingDefinition[] }) => {
      if (m.objectTypeExternalId !== sourceId) return m;
      const kept: AttributeMappingDefinition[] = [];
      for (const am of m.attributesMapping) {
        if (attrIds.has(am.attributeExternalId)) {
          const renamed = renames[am.attributeExternalId];
          movedMappings.push(renamed ? { ...am, attributeExternalId: renamed } : am);
          result.sourceRemoved++;
        } else {
          kept.push(am);
        }
      }
      return { ...m, attributesMapping: kept };
    },
  );

  if (movedMappings.length === 0) return afterSource;

  // Pass 2: add to destination
  return afterSource.map(
    (m: { objectTypeExternalId: string; attributesMapping: AttributeMappingDefinition[] }) => {
      if (m.objectTypeExternalId !== destId) return m;
      result.destAdded += movedMappings.length;
      return { ...m, attributesMapping: [...m.attributesMapping, ...movedMappings] };
    },
  );
}

// ── public API ────────────────────────────────────────────────────────────────

export function moveAttributes(
  document: AssetsImportDocument,
  sourceTypeExternalId: string,
  attributeExternalIds: string[],
  destinationTypeExternalId: string,
  /** Explicit rename map (old externalId → new externalId). Overrides the heuristic entirely when provided. */
  explicitRenames?: Record<string, string>,
): MoveAttributesResult {
  if (sourceTypeExternalId === destinationTypeExternalId || attributeExternalIds.length === 0) {
    return {
      document,
      movedCount: 0,
      skippedDuplicates: [],
      mappingSourceRemoved: 0,
      mappingDestAdded: 0,
      renames: {},
    };
  }

  // Use explicit renames when provided, otherwise fall back to the heuristic
  const renames: Record<string, string> = {};
  if (explicitRenames) {
    for (const id of attributeExternalIds) {
      const renamed = explicitRenames[id];
      if (renamed && renamed !== id) renames[id] = renamed;
    }
  } else {
    for (const id of attributeExternalIds) {
      const renamed = deriveRename(id, sourceTypeExternalId, destinationTypeExternalId);
      if (renamed && renamed !== id) renames[id] = renamed;
    }
  }

  const attrIds = new Set(attributeExternalIds);
  const collectedAttrs: ObjectAttributeDefinition[] = [];
  const skippedDuplicates: string[] = [];

  // Update schema tree
  const afterRemove = removeFromSource(
    document.schema.objectSchema.objectTypes,
    sourceTypeExternalId,
    attrIds,
    collectedAttrs,
  );

  const updatedObjectTypes = addToDestination(
    afterRemove,
    destinationTypeExternalId,
    collectedAttrs,
    renames,
    skippedDuplicates,
  );

  // Update mappings (renames applied to attributeExternalId references)
  const mappingResult = { sourceRemoved: 0, destAdded: 0 };
  const updatedMappings = updateMappings(
    document.mapping.objectTypeMappings,
    sourceTypeExternalId,
    destinationTypeExternalId,
    attrIds,
    renames,
    mappingResult,
  );

  // Only report renames that actually moved (not skipped)
  const skippedSet = new Set(skippedDuplicates);
  const effectiveRenames: Record<string, string> = {};
  for (const [oldId, newId] of Object.entries(renames)) {
    if (!skippedSet.has(oldId)) effectiveRenames[oldId] = newId;
  }

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
      mapping: {
        ...document.mapping,
        objectTypeMappings: updatedMappings,
      },
    },
    movedCount: collectedAttrs.length - skippedDuplicates.length,
    skippedDuplicates,
    mappingSourceRemoved: mappingResult.sourceRemoved,
    mappingDestAdded: mappingResult.destAdded,
    renames: effectiveRenames,
  };
}
