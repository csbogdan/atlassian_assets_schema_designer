'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { DataSet } from 'vis-data';
import { Network } from 'vis-network';
import type { FlattenedObjectType } from '@/domain/model/types';

type SchemaGraphV11Props = {
  flattened: FlattenedObjectType[];
  selectedExternalId?: string;
  onSelect: (externalId: string) => void;
  heightClassName?: string;
  showMiniMap?: boolean;
};

type LineStyle = 'curved' | 'straight';

export function SchemaGraphV11({
  flattened,
  selectedExternalId,
  onSelect,
  heightClassName = 'h-[560px]',
  showMiniMap = true,
}: SchemaGraphV11Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const minimapRef = useRef<HTMLDivElement | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapViewportRef = useRef<HTMLDivElement | null>(null);
  const networkRef = useRef<Network | null>(null);
  const applySelectionRef = useRef<((externalId?: string) => void) | null>(null);
  const onSelectRef = useRef<(externalId: string) => void>(onSelect);
  const queueMinimapRenderRef = useRef<(() => void) | null>(null);
  const hasAutoFittedRef = useRef(false);
  const [lineStyle, setLineStyle] = useState<LineStyle>('curved');
  const [showAllRefs, setShowAllRefs] = useState(false);
  const [isolateMode, setIsolateMode] = useState(true);
  const [selectedId, setSelectedId] = useState<string | undefined>(selectedExternalId);
  const [outgoingCount, setOutgoingCount] = useState(0);
  const [incomingCount, setIncomingCount] = useState(0);

  // compute color palette per depth level so nodes at different depths have
  // visually distinct backgrounds. the hue is spaced evenly around the circle,
  // saturation is constant and lightness high for a soft look. we also prepare
  // a slightly darker border color for contrast.
  const { depthColors, borderColors } = useMemo(() => {
    let max = 0;
    flattened.forEach((n) => {
      if (n.depth > max) max = n.depth;
    });
    if (max < 0) max = 0;
    const dc: string[] = [];
    const bc: string[] = [];
    for (let d = 0; d <= max; d += 1) {
      const hue = Math.round((d / (max + 1)) * 360);
      dc.push(`hsl(${hue},60%,90%)`);
      bc.push(`hsl(${hue},60%,60%)`);
    }
    return { depthColors: dc, borderColors: bc };
  }, [flattened]);

  const graphData = useMemo(() => {
    const nodes = flattened.map((item) => ({
      id: item.objectType.externalId,
      label: `${item.objectType.name}\n${item.objectType.externalId}`,
      depth: item.depth,
    }));

    const hierarchyEdges = flattened
      .filter((item) => Boolean(item.parentExternalId))
      .map((item, index) => ({
        id: `h-${index}-${item.parentExternalId}-${item.objectType.externalId}`,
        from: item.parentExternalId as string,
        to: item.objectType.externalId,
        kind: 'hierarchy' as const,
      }));

    const seenRefs = new Set<string>();
    const referenceEdges: Array<{ id: string; from: string; to: string; kind: 'reference' }> = [];

    flattened.forEach((item) => {
      (item.objectType.attributes ?? [])
        .filter((attribute) => attribute.type === 'referenced_object' && attribute.referenceObjectTypeExternalId)
        .forEach((attribute) => {
          const source = item.objectType.externalId;
          const target = String(attribute.referenceObjectTypeExternalId);
          const key = `${source}->${target}`;
          if (seenRefs.has(key)) {
            return;
          }
          seenRefs.add(key);
          referenceEdges.push({
            id: `r-${referenceEdges.length}-${source}-${target}`,
            from: source,
            to: target,
            kind: 'reference',
          });
        });
    });

    return {
      nodes,
      edges: [...hierarchyEdges, ...referenceEdges],
      hierarchyEdges,
      referenceEdges,
    };
  }, [flattened]);

  const firstRootExternalId = useMemo(
    () => flattened.find((item) => item.depth === 0)?.objectType.externalId,
    [flattened],
  );

  useEffect(() => {
    setSelectedId(selectedExternalId);
  }, [selectedExternalId]);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!containerRef.current || flattened.length === 0) {
      return;
    }

    const edgeSmoothFor = (kind: 'hierarchy' | 'reference') => {
      if (lineStyle === 'curved') {
        return kind === 'reference'
          ? { enabled: true, type: 'straightCross', roundness: 0.25 }
          : { enabled: true, type: 'straightCross', roundness: 0.15 };
      }
      return false;
    };

    const nodeData = new DataSet<any>(graphData.nodes.map((node) => {
      const depth = node.depth ?? 0;
      return {
        ...node,
        shape: 'box',
        margin: { top: 8, right: 8, bottom: 8, left: 8 },
        borderWidth: 1,
        shapeProperties: { borderRadius: 8 },
        color: { background: depthColors[depth] || '#ffffff', border: borderColors[depth] || '#94a3b8' },
        widthConstraint: { minimum: 130, maximum: 240 },
        font: { color: '#0f172a', size: 12, face: 'Inter', multi: true },
      };
    }));

    const edgeData = new DataSet<any>(graphData.edges.map((edge) => ({
      ...edge,
      arrows: 'to',
      color: edge.kind === 'hierarchy' ? '#64748b' : '#94a3b8',
      width: edge.kind === 'hierarchy' ? 2 : 1.6,
      dashes: edge.kind === 'reference',
      smooth: edgeSmoothFor(edge.kind),
      hidden: edge.kind === 'reference' && !showAllRefs,
    })));

    const network = new Network(containerRef.current, { nodes: nodeData as any, edges: edgeData as any }, {
      layout: {
        hierarchical: {
          enabled: true,
          direction: 'LR',
          sortMethod: 'directed',
          levelSeparation: 210,
          nodeSpacing: 145,
          treeSpacing: 260,
        },
      },
      physics: false,
      interaction: {
        hover: true,
        hoverConnectedEdges: true,
        dragNodes: true,
        dragView: true,
        zoomView: true,
        tooltipDelay: 120,
      },
    });

    const applySelection = (externalId?: string) => {
      edgeData.update(graphData.edges.map((edge) => ({
        id: edge.id,
        color: edge.kind === 'hierarchy' ? '#64748b' : '#94a3b8',
        width: edge.kind === 'hierarchy' ? 2 : 1.6,
        dashes: edge.kind === 'reference',
        smooth: edgeSmoothFor(edge.kind),
        hidden: edge.kind === 'reference' ? !showAllRefs : false,
      })));

      nodeData.update(graphData.nodes.map((node) => {
        const depth = node.depth ?? 0;
        return {
          id: node.id,
          color: { background: depthColors[depth] || '#ffffff', border: borderColors[depth] || '#94a3b8' },
          font: { color: '#0f172a', size: 12, face: 'Inter', multi: true },
          borderWidth: 1,
        };
      }));

      if (!externalId) {
        setOutgoingCount(0);
        setIncomingCount(0);
        return;
      }

      const outgoing = graphData.referenceEdges.filter((edge) => edge.from === externalId);
      const incoming = graphData.referenceEdges.filter((edge) => edge.to === externalId);
      setOutgoingCount(outgoing.length);
      setIncomingCount(incoming.length);

      nodeData.update({
        id: externalId,
        color: { background: '#fff7ed', border: '#f97316' },
        borderWidth: 2,
      });

      const touched = new Set<string>([externalId]);

      edgeData.update(outgoing.map((edge) => ({
        id: edge.id,
        color: '#dc2626',
        width: 3,
        dashes: false,
        hidden: false,
      })));
      outgoing.forEach((edge) => touched.add(edge.to));

      edgeData.update(incoming.map((edge) => ({
        id: edge.id,
        color: '#2563eb',
        width: 3,
        dashes: false,
        hidden: false,
      })));
      incoming.forEach((edge) => touched.add(edge.from));

      if (isolateMode) {
        edgeData.update(graphData.referenceEdges
          .filter((edge) => edge.from !== externalId && edge.to !== externalId)
          .map((edge) => ({
            id: edge.id,
            color: '#e2e8f0',
            width: 1,
            dashes: true,
            hidden: false,
          })));

        edgeData.update(graphData.hierarchyEdges
          .filter((edge) => edge.from !== externalId && edge.to !== externalId)
          .map((edge) => ({
            id: edge.id,
            color: '#e2e8f0',
            width: 1.2,
          })));

        nodeData.update(graphData.nodes
          .filter((node) => !touched.has(node.id))
          .map((node) => ({
            id: node.id,
            color: { background: '#f8fafc', border: '#e2e8f0' },
            font: { color: '#94a3b8' },
            borderWidth: 1,
          })));
      }
    };
    applySelectionRef.current = applySelection;

    const centerOnNodeReadable = (externalId: string, animated = true) => {
      const pos = network.getPositions([externalId])[externalId];
      if (!pos) {
        return;
      }
      const targetScale = Math.max(network.getScale(), 0.9);
      network.moveTo({
        position: { x: pos.x, y: pos.y },
        scale: targetScale,
        animation: animated ? { duration: 220, easingFunction: 'easeInOutQuad' } : false,
      });
      queueMinimapRender();
    };

    let minimapBounds: { minX: number; minY: number; width: number; height: number } | null = null;
    let minimapQueued = false;
    let minimapRafId: number | null = null;
    let isDisposed = false;
    let minimapDragState: {
      pointerId: number;
      offsetX: number;
      offsetY: number;
      canvasRect: DOMRect;
      didDrag: boolean;
    } | null = null;

    const getNodePositions = () => {
      if (isDisposed) {
        return {} as Record<string, { x: number; y: number }>;
      }
      return network.getPositions(graphData.nodes.map((node) => node.id));
    };

    const toMinimapPoint = (
      x: number,
      y: number,
      width: number,
      height: number,
      bounds: { minX: number; minY: number; width: number; height: number },
    ) => ({
      x: ((x - bounds.minX) / bounds.width) * width,
      y: ((y - bounds.minY) / bounds.height) * height,
    });

    const recomputeMinimapBounds = (positions: Record<string, { x: number; y: number }>) => {
      const xs: number[] = [];
      const ys: number[] = [];

      graphData.nodes.forEach((node) => {
        const pos = positions[node.id];
        if (!pos) return;
        xs.push(pos.x);
        ys.push(pos.y);
      });

      if (xs.length === 0 || ys.length === 0) {
        minimapBounds = { minX: -1, minY: -1, width: 2, height: 2 };
        return;
      }

      const pad = 80;
      const minX = Math.min(...xs) - pad;
      const maxX = Math.max(...xs) + pad;
      const minY = Math.min(...ys) - pad;
      const maxY = Math.max(...ys) + pad;

      minimapBounds = {
        minX,
        minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
      };
    };

    const renderMinimap = () => {
      if (isDisposed || !showMiniMap || !minimapRef.current || !minimapCanvasRef.current || !minimapViewportRef.current) {
        return;
      }

      const minimap = minimapRef.current;
      const canvas = minimapCanvasRef.current;
      const viewport = minimapViewportRef.current;

      const rect = minimap.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return;
      }

      const positions = getNodePositions();
      recomputeMinimapBounds(positions);
      if (!minimapBounds) {
        return;
      }

      const bounds = minimapBounds;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      graphData.edges.forEach((edge) => {
        const from = positions[edge.from];
        const to = positions[edge.to];
        if (!from || !to) return;
        const p1 = toMinimapPoint(from.x, from.y, width, height, bounds);
        const p2 = toMinimapPoint(to.x, to.y, width, height, bounds);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      });

      ctx.fillStyle = '#64748b';
      graphData.nodes.forEach((node) => {
        const pos = positions[node.id];
        if (!pos) return;
        const p = toMinimapPoint(pos.x, pos.y, width, height, bounds);
        ctx.fillRect(p.x - 1.6, p.y - 1.6, 3.2, 3.2);
      });

      const scale = Math.max(0.0001, network.getScale());
      const view = network.getViewPosition();
      const halfW = containerRef.current ? containerRef.current.clientWidth / (2 * scale) : 0;
      const halfH = containerRef.current ? containerRef.current.clientHeight / (2 * scale) : 0;
      const worldLeft = view.x - halfW;
      const worldTop = view.y - halfH;
      const worldRight = view.x + halfW;
      const worldBottom = view.y + halfH;

      const topLeft = toMinimapPoint(worldLeft, worldTop, width, height, bounds);
      const bottomRight = toMinimapPoint(worldRight, worldBottom, width, height, bounds);
      const left = Math.max(0, Math.min(width, topLeft.x));
      const top = Math.max(0, Math.min(height, topLeft.y));
      const right = Math.max(0, Math.min(width, bottomRight.x));
      const bottom = Math.max(0, Math.min(height, bottomRight.y));

      viewport.style.left = `${left}px`;
      viewport.style.top = `${top}px`;
      viewport.style.width = `${Math.max(8, right - left)}px`;
      viewport.style.height = `${Math.max(8, bottom - top)}px`;
    };

    const queueMinimapRender = () => {
      if (isDisposed || !showMiniMap || minimapQueued) {
        return;
      }
      minimapQueued = true;
      minimapRafId = requestAnimationFrame(() => {
        minimapQueued = false;
        minimapRafId = null;
        renderMinimap();
      });
    };
    queueMinimapRenderRef.current = queueMinimapRender;

    const applyZoomFactor = (factor: number) => {
      const currentScale = network.getScale();
      const view = network.getViewPosition();
      const nextScale = Math.max(0.08, Math.min(3.2, currentScale * factor));
      network.moveTo({
        position: view,
        scale: nextScale,
        animation: { duration: 180, easingFunction: 'easeInOutQuad' },
      });
      queueMinimapRender();
    };

    const moveMainViewToMinimapPoint = (x: number, y: number, rect: DOMRect, animated = false) => {
      if (!minimapBounds) {
        return;
      }
      const nx = Math.max(0, Math.min(1, x / Math.max(1, rect.width)));
      const ny = Math.max(0, Math.min(1, y / Math.max(1, rect.height)));
      const worldX = minimapBounds.minX + nx * minimapBounds.width;
      const worldY = minimapBounds.minY + ny * minimapBounds.height;
      network.moveTo({
        position: { x: worldX, y: worldY },
        animation: animated ? { duration: 180, easingFunction: 'easeInOutQuad' } : false,
      });
      queueMinimapRender();
    };

    const onMinimapClick = (event: MouseEvent) => {
      if (!minimapCanvasRef.current || minimapDragState?.didDrag) {
        return;
      }
      const rect = minimapCanvasRef.current.getBoundingClientRect();
      moveMainViewToMinimapPoint(event.clientX - rect.left, event.clientY - rect.top, rect, true);
    };

    const detachMinimapDragListeners = () => {
      window.removeEventListener('pointermove', onMinimapMove);
      window.removeEventListener('pointerup', onMinimapDragEnd);
      window.removeEventListener('pointercancel', onMinimapDragEnd);
    };

    const onMinimapDown = (event: PointerEvent) => {
      if (!showMiniMap || !minimapBounds || !minimapViewportRef.current || !minimapCanvasRef.current || event.button !== 0) {
        return;
      }
      event.preventDefault();
      const canvasRect = minimapCanvasRef.current.getBoundingClientRect();
      const viewportRect = minimapViewportRef.current.getBoundingClientRect();
      minimapDragState = {
        pointerId: event.pointerId,
        offsetX: event.clientX - viewportRect.left,
        offsetY: event.clientY - viewportRect.top,
        canvasRect,
        didDrag: false,
      };
      minimapViewportRef.current.classList.add('dragging');
      window.addEventListener('pointermove', onMinimapMove);
      window.addEventListener('pointerup', onMinimapDragEnd);
      window.addEventListener('pointercancel', onMinimapDragEnd);
    };

    const onMinimapMove = (event: PointerEvent) => {
      if (!minimapDragState || event.pointerId !== minimapDragState.pointerId || !minimapViewportRef.current || !minimapCanvasRef.current) {
        return;
      }
      if ((event.buttons & 1) !== 1) {
        onMinimapDragEnd(event);
        return;
      }
      const rect = minimapDragState.canvasRect;
      const vpWidth = Math.max(8, minimapViewportRef.current.offsetWidth);
      const vpHeight = Math.max(8, minimapViewportRef.current.offsetHeight);
      const left = event.clientX - rect.left - minimapDragState.offsetX;
      const top = event.clientY - rect.top - minimapDragState.offsetY;
      const clampedLeft = Math.max(0, Math.min(rect.width - vpWidth, left));
      const clampedTop = Math.max(0, Math.min(rect.height - vpHeight, top));
      minimapDragState.didDrag = true;
      moveMainViewToMinimapPoint(clampedLeft + vpWidth / 2, clampedTop + vpHeight / 2, rect, false);
    };

    const onMinimapDragEnd = (event: PointerEvent) => {
      if (!minimapDragState || event.pointerId !== minimapDragState.pointerId || !minimapViewportRef.current || !minimapCanvasRef.current) {
        return;
      }
      minimapViewportRef.current.classList.remove('dragging');
      minimapDragState = null;
      detachMinimapDragListeners();
      queueMinimapRender();
    };

    network.on('click', (params: any) => {
      if (!params.nodes || params.nodes.length === 0) {
        setSelectedId(undefined);
        applySelection(undefined);
        if (firstRootExternalId) {
          centerOnNodeReadable(firstRootExternalId, true);
        }
        return;
      }

      const clickedId = params.nodes[0] as string;
      setSelectedId(clickedId);
      applySelection(clickedId);
      centerOnNodeReadable(clickedId, true);
      onSelectRef.current(clickedId);
    });

    networkRef.current = network;
    if (!hasAutoFittedRef.current) {
      network.fit({ animation: { duration: 250, easingFunction: 'easeInOutQuad' } });
      hasAutoFittedRef.current = true;
    }
    applySelection(selectedId);

    if (showMiniMap && minimapCanvasRef.current && minimapViewportRef.current) {
      minimapCanvasRef.current.addEventListener('click', onMinimapClick);
      minimapViewportRef.current.addEventListener('pointerdown', onMinimapDown);
      window.addEventListener('resize', queueMinimapRender);
      network.on('dragging', queueMinimapRender);
      network.on('zoom', queueMinimapRender);
      network.on('afterDrawing', queueMinimapRender);
      queueMinimapRender();
    }

    return () => {
      isDisposed = true;
      applySelectionRef.current = null;
      queueMinimapRenderRef.current = null;
      networkRef.current = null;
      if (minimapRafId !== null) {
        cancelAnimationFrame(minimapRafId);
        minimapRafId = null;
      }
      detachMinimapDragListeners();
      if (showMiniMap && minimapCanvasRef.current && minimapViewportRef.current) {
        minimapCanvasRef.current.removeEventListener('click', onMinimapClick);
        minimapViewportRef.current.removeEventListener('pointerdown', onMinimapDown);
        window.removeEventListener('resize', queueMinimapRender);
      }
      network.destroy();
    };
  }, [firstRootExternalId, flattened, graphData, isolateMode, lineStyle, showAllRefs, showMiniMap, depthColors, borderColors]);

  useEffect(() => {
    applySelectionRef.current?.(selectedId);
  }, [selectedId]);

  if (flattened.length === 0) {
    return <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">No graph data.</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 overflow-x-auto text-xs">
        <button
          className="rounded border border-slate-300 bg-white px-2 py-1"
          onClick={() => networkRef.current?.fit({ animation: { duration: 250, easingFunction: 'easeInOutQuad' } })}
        >
          Fit to view
        </button>
        <button
          className="rounded border border-slate-300 bg-white px-2 py-1"
          onClick={() => {
            setSelectedId(undefined);
            const network = networkRef.current;
            if (!network || !firstRootExternalId) {
              return;
            }
            const pos = network.getPositions([firstRootExternalId])[firstRootExternalId];
            if (!pos) {
              return;
            }
            network.moveTo({
              position: { x: pos.x, y: pos.y },
              scale: Math.max(network.getScale(), 0.9),
              animation: { duration: 220, easingFunction: 'easeInOutQuad' },
            });
          }}
        >
          Clear selection
        </button>
        <label className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1">
          <input type="checkbox" checked={showAllRefs} onChange={(event) => setShowAllRefs(event.target.checked)} />
          Show all refs
        </label>
        <label className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1">
          <input type="checkbox" checked={isolateMode} onChange={(event) => setIsolateMode(event.target.checked)} />
          Isolate selection
        </label>
        <select
          className="rounded border border-slate-300 bg-white px-2 py-1"
          value={lineStyle}
          onChange={(event) => setLineStyle(event.target.value as LineStyle)}
        >
          <option value="curved">Line style: Curved</option>
          <option value="straight">Line style: Straight</option>
        </select>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">Selected: <strong>{selectedId ?? 'none'}</strong></span>
        <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-red-700">Outgoing refs: <strong>{outgoingCount}</strong></span>
        <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-blue-700">Incoming used-by: <strong>{incomingCount}</strong></span>
      </div>
      <div className={`${heightClassName} relative isolate overflow-hidden rounded border border-slate-200`}>
        <div ref={containerRef} className="h-full w-full bg-white" />
        {showMiniMap ? (
          <div
            ref={minimapRef}
            className="absolute bottom-2 right-2 z-30 h-[132px] w-[210px] max-h-[35%] max-w-[42%] overflow-hidden rounded-md border border-slate-300 bg-white/92 shadow"
          >
            <canvas ref={minimapCanvasRef} className="h-full w-full cursor-pointer" />
            <div ref={minimapViewportRef} className="absolute border-2 border-blue-600 bg-blue-500/10" style={{ cursor: 'grab' }} />
            <div className="absolute right-2 top-1 z-10 flex gap-1">
              <button
                className="h-5 w-5 rounded border border-slate-300 bg-white text-xs font-bold"
                onClick={() => {
                  const network = networkRef.current;
                  if (!network) return;
                  const currentScale = network.getScale();
                  const view = network.getViewPosition();
                  network.moveTo({
                    position: view,
                    scale: Math.max(0.08, Math.min(3.2, currentScale * 1.18)),
                    animation: { duration: 180, easingFunction: 'easeInOutQuad' },
                  });
                  queueMinimapRenderRef.current?.();
                }}
              >
                +
              </button>
              <button
                className="h-5 w-5 rounded border border-slate-300 bg-white text-xs font-bold"
                onClick={() => {
                  const network = networkRef.current;
                  if (!network) return;
                  const currentScale = network.getScale();
                  const view = network.getViewPosition();
                  network.moveTo({
                    position: view,
                    scale: Math.max(0.08, Math.min(3.2, currentScale / 1.18)),
                    animation: { duration: 180, easingFunction: 'easeInOutQuad' },
                  });
                  queueMinimapRenderRef.current?.();
                }}
              >
                −
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
