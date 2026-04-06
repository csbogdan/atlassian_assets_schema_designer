import type { AssetsImportDocument, Diagnostic } from '@/domain/model/types';
import { flattenObjectTypes } from '@/domain/selectors/indexes';

export function validateInheritanceConflicts(document: AssetsImportDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const flattened = flattenObjectTypes(document.schema.objectSchema.objectTypes);

  // Build a quick lookup so we can resolve parent jsonPaths.
  const byExternalId = new Map(flattened.map((item) => [item.objectType.externalId, item]));

  for (const item of flattened) {
    if (item.inheritedAttributes.length === 0) {
      continue;
    }

    // Build a map of inherited attribute type by externalId.
    const inheritedTypeByExternalId = new Map(
      item.inheritedAttributes.map((attr) => [attr.externalId, attr.type]),
    );

    const localAttributes = item.objectType.attributes ?? [];

    for (let localAttrIndex = 0; localAttrIndex < localAttributes.length; localAttrIndex++) {
      const localAttr = localAttributes[localAttrIndex];
      const inheritedType = inheritedTypeByExternalId.get(localAttr.externalId);

      // No inherited counterpart — not a conflict.
      if (inheritedType === undefined) {
        continue;
      }

      // Same type — override is allowed, no diagnostic.
      if (localAttr.type === inheritedType) {
        continue;
      }

      // Different type — emit conflict diagnostic.
      const childJsonPath = item.jsonPath;
      const path = `${childJsonPath}/attributes/${localAttrIndex}/type`;

      // Locate the parent's copy of this attribute for relatedPaths.
      let relatedPaths: string[] | undefined;
      if (item.parentExternalId) {
        const parentItem = byExternalId.get(item.parentExternalId);
        if (parentItem) {
          const parentAttrIndex = (parentItem.objectType.attributes ?? []).findIndex(
            (a) => a.externalId === localAttr.externalId,
          );
          if (parentAttrIndex !== -1) {
            relatedPaths = [`${parentItem.jsonPath}/attributes/${parentAttrIndex}/type`];
          }
        }
      }

      diagnostics.push({
        code: 'INHERITED_ATTRIBUTE_TYPE_CONFLICT',
        severity: 'warning',
        message: `"${item.objectType.name}" redefines inherited attribute "${localAttr.externalId}" with type "${localAttr.type}" (parent declares "${inheritedType}").`,
        path,
        relatedPaths,
        suggestion: 'Remove or rename the local attribute to avoid shadowing the inherited definition.',
        metadata: {
          objectTypeExternalId: item.objectType.externalId,
          attributeExternalId: localAttr.externalId,
        },
      });
    }
  }

  return diagnostics;
}
