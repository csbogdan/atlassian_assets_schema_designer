import type { AssetsImportDocument, Diagnostic } from '@/domain/model/types';
import { buildIndexes } from '@/domain/selectors/indexes';

export function analyzeImpact(previousDocument: AssetsImportDocument, nextDocument: AssetsImportDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const previousIndexes = buildIndexes(previousDocument);
  const nextIndexes = buildIndexes(nextDocument);

  // --- Object type removed while it still had a mapping ---
  for (const [externalId, previousObjectType] of previousIndexes.objectTypesByExternalId.entries()) {
    if (!nextIndexes.objectTypesByExternalId.has(externalId) && previousIndexes.mappingsByObjectTypeExternalId.has(externalId)) {
      diagnostics.push({
        code: 'BREAKING_OBJECT_TYPE_REMOVED',
        severity: 'error',
        message: `Object type "${externalId}" was removed but still had mappings in the baseline document.`,
        path: previousObjectType.jsonPath,
        metadata: { objectTypeExternalId: externalId },
      });
    }
  }

  for (const [externalId, previousType] of previousIndexes.objectTypesByExternalId.entries()) {
    const nextType = nextIndexes.objectTypesByExternalId.get(externalId);
    if (!nextType) continue; // already reported above

    const previousMapping = previousIndexes.mappingsByObjectTypeExternalId.get(externalId);
    const nextMapping = nextIndexes.mappingsByObjectTypeExternalId.get(externalId);

    // --- Mapped attribute removed ---
    if (previousMapping) {
      const nextAttrIds = new Set((nextType.objectType.attributes ?? []).map((a) => a.externalId));
      for (const attr of (previousType.objectType.attributes ?? [])) {
        if (!nextAttrIds.has(attr.externalId)) {
          const hasMappingRow = previousMapping.attributesMapping.some((row) => row.attributeExternalId === attr.externalId);
          if (hasMappingRow) {
            diagnostics.push({
              code: 'BREAKING_MAPPED_ATTRIBUTE_REMOVED',
              severity: 'error',
              message: `Attribute "${attr.externalId}" was removed from "${externalId}" but is still referenced in its mapping.`,
              path: previousType.jsonPath,
              suggestion: 'Remove the corresponding attribute mapping row or restore the attribute.',
              metadata: { objectTypeExternalId: externalId, attributeExternalId: attr.externalId },
            });
          }
        }
      }
    }

    // --- Attribute type changed (ANY type change is breaking) ---
    for (const prevAttr of (previousType.objectType.attributes ?? [])) {
      const nextAttr = (nextType.objectType.attributes ?? []).find((a) => a.externalId === prevAttr.externalId);
      if (!nextAttr) continue; // handled above

      if (prevAttr.type !== nextAttr.type) {
        const attrIndex = (nextType.objectType.attributes ?? []).findIndex((a) => a.externalId === prevAttr.externalId);
        diagnostics.push({
          code: 'BREAKING_ATTRIBUTE_TYPE_CHANGED',
          severity: 'error',
          message: `Attribute "${prevAttr.externalId}" on "${externalId}" changed type from "${prevAttr.type}" to "${nextAttr.type}".`,
          path: attrIndex >= 0
            ? `${nextType.jsonPath}/attributes/${attrIndex}/type`
            : nextType.jsonPath,
          suggestion: 'Attribute types are immutable once created. Drop this attribute and create a new one with a different externalId, then update the mapping row.',
          metadata: {
            objectTypeExternalId: externalId,
            attributeExternalId: prevAttr.externalId,
            previousType: prevAttr.type,
            newType: nextAttr.type,
          },
        });
      }

      // --- Reference target changed ---
      if (
        prevAttr.type === 'referenced_object' &&
        nextAttr.type === 'referenced_object' &&
        prevAttr.referenceObjectTypeExternalId !== nextAttr.referenceObjectTypeExternalId
      ) {
        const attrIndex = (nextType.objectType.attributes ?? []).findIndex((a) => a.externalId === prevAttr.externalId);
        diagnostics.push({
          code: 'BREAKING_REFERENCE_TARGET_CHANGED',
          severity: 'warning',
          message: `Referenced object attribute "${prevAttr.externalId}" on "${externalId}" changed target from "${prevAttr.referenceObjectTypeExternalId ?? 'none'}" to "${nextAttr.referenceObjectTypeExternalId ?? 'none'}".`,
          path: attrIndex >= 0
            ? `${nextType.jsonPath}/attributes/${attrIndex}/referenceObjectTypeExternalId`
            : nextType.jsonPath,
          suggestion: 'Review the objectMappingIQL in any mapping row for this attribute — the IQL field name may need to be updated to match the new target type\'s label attribute.',
          metadata: { objectTypeExternalId: externalId, attributeExternalId: prevAttr.externalId },
        });
      }
    }

    // --- Selector changed on an existing mapping ---
    if (previousMapping && nextMapping && previousMapping.selector !== nextMapping.selector) {
      const nextMappingIndex = nextDocument.mapping.objectTypeMappings.findIndex(
        (m) => m.objectTypeExternalId === externalId,
      );
      diagnostics.push({
        code: 'BREAKING_SELECTOR_CHANGED',
        severity: 'warning',
        message: `Mapping for "${externalId}" selector changed from "${previousMapping.selector}" to "${nextMapping.selector}".`,
        path: nextMappingIndex >= 0
          ? `/mapping/objectTypeMappings/${nextMappingIndex}/selector`
          : `/mapping/objectTypeMappings`,
        suggestion: 'Changing the selector may break scheduled import jobs that rely on the existing data path.',
        metadata: { objectTypeExternalId: externalId },
      });
    }

    // --- externalIdPart removed from a mapped attribute ---
    if (previousMapping && nextMapping) {
      for (const prevAttrMap of previousMapping.attributesMapping) {
        if (!prevAttrMap.externalIdPart) continue;
        const nextAttrMap = nextMapping.attributesMapping.find(
          (a) => a.attributeExternalId === prevAttrMap.attributeExternalId,
        );
        if (!nextAttrMap?.externalIdPart) {
          const nextMappingIndex = nextDocument.mapping.objectTypeMappings.findIndex(
            (m) => m.objectTypeExternalId === externalId,
          );
          const nextAttrIndex = nextMappingIndex >= 0
            ? nextMapping.attributesMapping.findIndex((a) => a.attributeExternalId === prevAttrMap.attributeExternalId)
            : -1;
          diagnostics.push({
            code: 'BREAKING_EXTERNAL_ID_PART_REMOVED',
            severity: 'error',
            message: `Attribute "${prevAttrMap.attributeExternalId}" was the external ID part for "${externalId}" but externalIdPart is no longer set.`,
            path: nextMappingIndex >= 0 && nextAttrIndex >= 0
              ? `/mapping/objectTypeMappings/${nextMappingIndex}/attributesMapping/${nextAttrIndex}/externalIdPart`
              : `/mapping/objectTypeMappings/${nextMappingIndex}`,
            suggestion: 'Removing the external ID part breaks object identity — the importer cannot match existing objects. Restore externalIdPart=true or designate a different stable identifier.',
            metadata: { objectTypeExternalId: externalId, attributeExternalId: prevAttrMap.attributeExternalId },
          });
        }
      }
    }
  }

  return diagnostics;
}
