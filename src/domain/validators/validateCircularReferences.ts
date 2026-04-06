import type { AssetsImportDocument, Diagnostic } from '@/domain/model/types';
import { buildIndexes, flattenObjectTypes } from '@/domain/selectors/indexes';

type NodeColor = 'white' | 'grey' | 'black';

type EdgeInfo = {
  targetExternalId: string;
  attributeExternalId: string;
  jsonPath: string;
};

export function validateCircularReferences(document: AssetsImportDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const flattened = flattenObjectTypes(document.schema.objectSchema.objectTypes);
  const indexes = buildIndexes(document);

  // Build adjacency list: objectTypeExternalId -> edges via referenced_object attributes
  const adjacency = new Map<string, EdgeInfo[]>();
  for (const item of flattened) {
    const edges: EdgeInfo[] = [];
    for (const [attrIndex, attribute] of (item.objectType.attributes ?? []).entries()) {
      if (
        attribute.type === 'referenced_object' &&
        attribute.referenceObjectTypeExternalId &&
        indexes.objectTypesByExternalId.has(attribute.referenceObjectTypeExternalId)
      ) {
        edges.push({
          targetExternalId: attribute.referenceObjectTypeExternalId,
          attributeExternalId: attribute.externalId,
          jsonPath: `${item.jsonPath}/attributes/${attrIndex}`,
        });
      }
    }
    adjacency.set(item.objectType.externalId, edges);
  }

  const color = new Map<string, NodeColor>();
  for (const item of flattened) {
    color.set(item.objectType.externalId, 'white');
  }

  // Track the DFS stack for path reconstruction
  // stack contains { externalId, closingJsonPath } for the edge used to reach this node
  type StackFrame = {
    externalId: string;
    jsonPath: string; // jsonPath of the edge (attribute) used to reach this node (empty for start)
  };

  const reportedCycles = new Set<string>();

  function dfs(stack: StackFrame[]): void {
    const current = stack[stack.length - 1];
    const currentId = current.externalId;

    color.set(currentId, 'grey');

    for (const edge of adjacency.get(currentId) ?? []) {
      const targetColor = color.get(edge.targetExternalId);

      if (targetColor === 'grey') {
        // Found a back-edge — reconstruct cycle
        const cycleStart = stack.findIndex((f) => f.externalId === edge.targetExternalId);
        if (cycleStart === -1) continue;

        const cycleFrames = stack.slice(cycleStart);
        const cycleIds = cycleFrames.map((f) => f.externalId);

        // Normalise cycle key so A->B->C == B->C->A
        const minIdx = cycleIds.indexOf(
          cycleIds.reduce((min, id) => (id < min ? id : min), cycleIds[0]),
        );
        const normalised = [...cycleIds.slice(minIdx), ...cycleIds.slice(0, minIdx)].join('→');

        if (reportedCycles.has(normalised)) continue;
        reportedCycles.add(normalised);

        const closingPath = edge.jsonPath;
        const otherPaths = cycleFrames.slice(1).map((f) => f.jsonPath).filter((p) => p !== '');

        diagnostics.push({
          code: 'CIRCULAR_REFERENCE_DETECTED',
          severity: 'error',
          message: `Circular reference: ${[...cycleIds, cycleIds[0]].join(' → ')}`,
          path: closingPath,
          relatedPaths: otherPaths.length > 0 ? otherPaths : undefined,
        });
      } else if (targetColor === 'white') {
        stack.push({ externalId: edge.targetExternalId, jsonPath: edge.jsonPath });
        dfs(stack);
        stack.pop();
      }
    }

    color.set(currentId, 'black');
  }

  for (const item of flattened) {
    if (color.get(item.objectType.externalId) === 'white') {
      dfs([{ externalId: item.objectType.externalId, jsonPath: '' }]);
    }
  }

  return diagnostics;
}
