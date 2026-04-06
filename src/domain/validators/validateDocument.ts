import type { AssetsImportDocument, Diagnostic } from '@/domain/model/types';
import { flattenObjectTypes } from '@/domain/selectors/indexes';
import { validateContract } from '@/domain/validators/validateContract';
import { validateBusinessRules } from '@/domain/validators/validateBusinessRules';
import { validateCrossReferences } from '@/domain/validators/crossReference';
import { validateCircularReferences } from '@/domain/validators/validateCircularReferences';
import { validateInheritanceConflicts } from '@/domain/validators/validateInheritanceConflicts';

export function validateDocument(document: AssetsImportDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const flattened = flattenObjectTypes(document.schema.objectSchema.objectTypes);
  const objectTypeIds = new Set<string>();

  flattened.forEach((item) => {
    if (objectTypeIds.has(item.objectType.externalId)) {
      diagnostics.push({
        code: 'DUPLICATE_OBJECT_TYPE_EXTERNAL_ID',
        severity: 'error',
        message: `Duplicate object type externalId ${item.objectType.externalId}.`,
        path: item.jsonPath,
        suggestion: 'Rename one of the duplicate object type external IDs so every object type externalId is unique.',
      });
    }
    objectTypeIds.add(item.objectType.externalId);

    const attributeIds = new Set<string>();
    (item.objectType.attributes ?? []).forEach((attribute, attributeIndex) => {
      const attributePath = `${item.jsonPath}/attributes/${attributeIndex}`;

      if (attributeIds.has(attribute.externalId)) {
        diagnostics.push({
          code: 'DUPLICATE_ATTRIBUTE_EXTERNAL_ID',
          severity: 'error',
          message: `Duplicate attribute externalId ${attribute.externalId} in ${item.objectType.externalId}.`,
          path: attributePath,
          suggestion: 'Rename one of the duplicate attribute external IDs within this object type.',
        });
      }
      attributeIds.add(attribute.externalId);

      if (attribute.type === 'referenced_object' && !attribute.referenceObjectTypeExternalId) {
        diagnostics.push({
          code: 'REFERENCED_OBJECT_TARGET_MISSING',
          severity: 'error',
          message: `Referenced object attribute ${attribute.externalId} is missing referenceObjectTypeExternalId.`,
          path: attributePath,
          suggestion: 'Set referenceObjectTypeExternalId on this referenced_object attribute to a valid target object type externalId.',
        });
      }
    });
  });

  return [
    ...diagnostics,
    ...validateContract(document),
    ...validateBusinessRules(document),
    ...validateCrossReferences(document),
    ...validateCircularReferences(document),
    ...validateInheritanceConflicts(document),
  ];
}
