import { bench, describe } from 'vitest';
import { buildIndexes, flattenObjectTypes } from '@/domain/selectors/indexes';
import { generateObjectTypeMapping } from '@/domain/transformers/generateObjectTypeMapping';
import { buildSemanticDiff } from '@/domain/transformers/semanticDiff';
import { validateDocument } from '@/domain/validators/validateDocument';
import { generateLargeDocument } from '@/tests/fixtures/generateLargeDocument';

// 20 root types × 5 children = 100 leaf types + 20 roots = 120 object types total
const largeDoc = generateLargeDocument({ rootCount: 20, childrenPerRoot: 5, attributesPerType: 8 });

// Prepare a modified version for diff benchmarks
const modifiedDoc = generateLargeDocument({ rootCount: 22, childrenPerRoot: 5, attributesPerType: 8 });

describe('domain — large document (120 object types)', () => {
  bench('flattenObjectTypes', () => {
    flattenObjectTypes(largeDoc.schema.objectSchema.objectTypes);
  });

  bench('buildIndexes', () => {
    buildIndexes(largeDoc);
  });

  bench('validateDocument', () => {
    validateDocument(largeDoc);
  });

  bench('buildSemanticDiff', () => {
    buildSemanticDiff(largeDoc, modifiedDoc);
  });

  bench('generateObjectTypeMapping (all unmapped types)', () => {
    const flattened = flattenObjectTypes(largeDoc.schema.objectSchema.objectTypes);
    const indexes = buildIndexes(largeDoc);
    const mappedIds = new Set(largeDoc.mapping.objectTypeMappings.map((m) => m.objectTypeExternalId));
    for (const item of flattened) {
      if (!mappedIds.has(item.objectType.externalId)) {
        generateObjectTypeMapping(item, undefined, indexes);
      }
    }
  });
});
