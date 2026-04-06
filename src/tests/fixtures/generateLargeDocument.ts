import type { AssetsImportDocument, ObjectTypeDefinition } from '@/domain/model/types';

/**
 * Generates a large AssetsImportDocument for performance benchmarking.
 * Produces `rootCount` root object types, each with `childrenPerRoot` children,
 * and `attributesPerType` attributes per type (mix of text, select, referenced_object).
 */
export function generateLargeDocument(options?: {
  rootCount?: number;
  childrenPerRoot?: number;
  attributesPerType?: number;
}): AssetsImportDocument {
  const {
    rootCount = 20,
    childrenPerRoot = 5,
    attributesPerType = 8,
  } = options ?? {};

  const objectTypes: ObjectTypeDefinition[] = [];

  for (let r = 0; r < rootCount; r++) {
    const rootId = `type-root-${r}`;
    const children: ObjectTypeDefinition[] = [];

    for (let c = 0; c < childrenPerRoot; c++) {
      const childId = `type-root-${r}-child-${c}`;
      children.push({
        externalId: childId,
        name: `Root${r} Child${c}`,
        inheritance: true,
        attributes: Array.from({ length: attributesPerType }, (_, a) => {
          const attrId = `${childId}-attr-${a}`;
          if (a === 0) {
            return { externalId: attrId, name: `Name${a}`, type: 'text', label: true, minimumCardinality: 1, maximumCardinality: 1 };
          }
          if (a === 1) {
            return { externalId: attrId, name: `UID${a}`, type: 'text', unique: true, minimumCardinality: 1, maximumCardinality: 1 };
          }
          if (a === 2) {
            return {
              externalId: attrId,
              name: `Ref${a}`,
              type: 'referenced_object',
              referenceObjectTypeExternalId: rootId,
              referenceObjectTypeName: `Root${r}`,
            };
          }
          if (a === 3) {
            return { externalId: attrId, name: `Status${a}`, type: 'select', typeValues: ['Active', 'Inactive', 'Pending'] };
          }
          return { externalId: attrId, name: `Field${a}`, type: 'text' };
        }),
      });
    }

    objectTypes.push({
      externalId: rootId,
      name: `Root${r}`,
      attributes: Array.from({ length: attributesPerType }, (_, a) => ({
        externalId: `${rootId}-attr-${a}`,
        name: a === 0 ? 'Name' : `Field${a}`,
        type: 'text',
        label: a === 0,
        minimumCardinality: a === 0 ? 1 : 0,
        maximumCardinality: 1,
      })),
      children,
    });
  }

  // Map half the types (all children of even-numbered roots)
  const objectTypeMappings = objectTypes
    .filter((_, i) => i % 2 === 0)
    .flatMap((root) =>
      (root.children ?? []).map((child) => ({
        objectTypeExternalId: child.externalId,
        objectTypeName: child.name,
        selector: child.name.toLowerCase().replace(/\s+/g, '-'),
        unknownValues: 'ADD' as const,
        attributesMapping: (child.attributes ?? []).map((attr) => ({
          attributeExternalId: attr.externalId,
          attributeName: attr.name,
          attributeLocators: [attr.name.toLowerCase()],
          externalIdPart: Boolean(attr.label),
        })),
      })),
    );

  return {
    $schema: 'https://api.atlassian.com/jsm/assets/imports/external/schema/versions/2021_09_15',
    schema: {
      objectSchema: {
        name: 'Large Benchmark Schema',
        objectTypes,
      },
    },
    mapping: { objectTypeMappings },
  };
}
