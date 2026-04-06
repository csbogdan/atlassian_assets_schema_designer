'use client';

import { useMemo } from 'react';
import ReactFlow, { Background, Controls, MarkerType, MiniMap, type Edge, type Node } from 'reactflow';
import 'reactflow/dist/style.css';
import type { FlattenedObjectType } from '@/domain/model/types';
import { buildReferenceEdges } from '@/domain/selectors/referenceGraph';

type ReferenceGraphProps = {
  flattened: FlattenedObjectType[];
  selectedExternalId?: string;
  onSelect: (externalId: string) => void;
  heightClassName?: string;
};

export function ReferenceGraph({
  flattened,
  selectedExternalId,
  onSelect,
  heightClassName = 'h-[560px]',
}: ReferenceGraphProps) {
  const { nodes, edges } = useMemo(() => {
    if (flattened.length === 0) {
      return { nodes: [], edges: [] };
    }

    const refEdges = buildReferenceEdges(flattened);

    // Sort all types by name for a stable grid layout.
    const sorted = [...flattened].sort((a, b) =>
      a.objectType.name.localeCompare(b.objectType.name),
    );

    const columns = Math.max(1, Math.ceil(Math.sqrt(sorted.length)));
    const nodeWidth = 220;
    const nodeHeight = 80;
    const colGap = 60;
    const rowGap = 40;

    const graphNodes: Node[] = sorted.map((item, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const isSelected = item.objectType.externalId === selectedExternalId;

      return {
        id: item.objectType.externalId,
        position: {
          x: col * (nodeWidth + colGap),
          y: row * (nodeHeight + rowGap),
        },
        data: {
          label: (
            <div>
              <div style={{ fontWeight: isSelected ? 700 : 400 }}>
                {item.objectType.name}
              </div>
              <div style={{ fontSize: 10, color: '#64748b' }}>
                {item.objectType.externalId}
              </div>
            </div>
          ),
        },
        style: {
          border: isSelected ? '2px solid #0f172a' : '1px solid #cbd5e1',
          borderRadius: '8px',
          background: isSelected ? '#f1f5f9' : '#ffffff',
          fontSize: '12px',
          width: nodeWidth,
        },
      } as Node;
    });

    const graphEdges: Edge[] = refEdges.map((edge) => ({
      id: `ref:${edge.sourceExternalId}:${edge.attributeExternalId}:${edge.targetExternalId}`,
      source: edge.sourceExternalId,
      target: edge.targetExternalId,
      markerEnd: { type: MarkerType.ArrowClosed },
      label: edge.attributeName,
      labelStyle: { fontSize: 10 },
      labelBgStyle: { fill: '#f8fafc' },
      style: { stroke: '#3b82f6' },
    }));

    return { nodes: graphNodes, edges: graphEdges };
  }, [flattened, selectedExternalId]);

  if (flattened.length === 0) {
    return (
      <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
        No graph data.
      </div>
    );
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
        <MiniMap pannable zoomable />
        <Background />
      </ReactFlow>
    </div>
  );
}
