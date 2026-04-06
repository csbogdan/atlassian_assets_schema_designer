'use client';

import { useMemo } from 'react';
import ReactFlow, { Background, Controls, MarkerType, MiniMap, type Edge, type Node } from 'reactflow';
import 'reactflow/dist/style.css';
import type { FlattenedObjectType } from '@/domain/model/types';

type SchemaGraphProps = {
  flattened: FlattenedObjectType[];
  selectedExternalId?: string;
  onSelect: (externalId: string) => void;
  heightClassName?: string;
  showMiniMap?: boolean;
};

export function SchemaGraph({
  flattened,
  selectedExternalId,
  onSelect,
  heightClassName = 'h-[560px]',
  showMiniMap = true,
}: SchemaGraphProps) {
  const { nodes, edges } = useMemo(() => {
    const root = selectedExternalId
      ? flattened.find((item) => item.objectType.externalId === selectedExternalId)
      : flattened[0];

    if (!root) {
      return {
        nodes: [],
        edges: [],
      };
    }

    const subtree = flattened
      .filter((item) => item.jsonPath === root.jsonPath || item.jsonPath.startsWith(`${root.jsonPath}/children/`))
      .sort((left, right) => left.jsonPath.localeCompare(right.jsonPath));

    const subtreeExternalIds = new Set(subtree.map((item) => item.objectType.externalId));

    const graphNodes: Node[] = subtree.map((item, index) => {
      const relativeDepth = item.depth - root.depth;

      const externalRefs = (item.objectType.attributes ?? [])
        .filter((attribute) => attribute.type === 'referenced_object' && attribute.referenceObjectTypeExternalId)
        .map((attribute) => ({
          attributeName: attribute.name,
          targetExternalId: attribute.referenceObjectTypeExternalId as string,
        }))
        .filter((reference) => !subtreeExternalIds.has(reference.targetExternalId));

      return {
        id: item.objectType.externalId,
        position: {
          x: relativeDepth * 280,
          y: index * 110,
        },
        data: {
          label: (
            <div>
              <div>{item.objectType.name} ({item.objectType.externalId})</div>
              {externalRefs.length > 0 ? (
                <details style={{ marginTop: 4 }}>
                  <summary style={{ color: '#92400e', fontSize: 10, cursor: 'pointer' }}>
                    External refs ({externalRefs.length})
                  </summary>
                  <div style={{ marginTop: 4, color: '#92400e', fontSize: 10 }}>
                    {externalRefs.map((reference) => (
                      <div key={`${item.objectType.externalId}:${reference.attributeName}:${reference.targetExternalId}`}>
                        {reference.attributeName} → {reference.targetExternalId}
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          ),
        },
        style: {
          border: item.objectType.externalId === root.objectType.externalId ? '2px solid #0f172a' : '1px solid #cbd5e1',
          borderRadius: '8px',
          background: item.objectType.externalId === root.objectType.externalId ? '#f1f5f9' : '#ffffff',
          fontSize: '12px',
          width: 260,
        },
      } as Node;
    });

    const parentEdges: Edge[] = [];

    subtree.forEach((item) => {
      if (item.parentExternalId && subtreeExternalIds.has(item.parentExternalId)) {
        parentEdges.push({
          id: `parent:${item.parentExternalId}->${item.objectType.externalId}`,
          source: item.parentExternalId,
          target: item.objectType.externalId,
          markerEnd: { type: MarkerType.ArrowClosed },
          label: 'child',
          style: { stroke: '#64748b' },
          labelStyle: { fontSize: 10 },
        });
      }
    });

    return {
      nodes: graphNodes,
      edges: parentEdges,
    };
  }, [flattened, selectedExternalId]);

  if (flattened.length === 0) {
    return <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">No graph data.</div>;
  }

  return (
    <div className={`${heightClassName} overflow-hidden rounded border border-slate-200`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        onNodeClick={(_, node) => onSelect(node.id)}
      >
        <Controls />
        {showMiniMap ? <MiniMap pannable zoomable /> : null}
        <Background />
      </ReactFlow>
    </div>
  );
}
