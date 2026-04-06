'use client';

import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { flattenObjectTypes } from '@/domain/selectors/indexes';
import { useDocumentStore } from '@/stores/documentStore';
import { generateObjectTypeMapping } from '@/domain/transformers/generateObjectTypeMapping';
import { cloneObjectType } from '@/domain/transformers/cloneObjectType';
import { SchemaGraph } from '@/features/schema/SchemaGraph';
import { SchemaGraphV11 } from '@/features/schema/SchemaGraphV11';
import { BulkAttributePanel } from '@/features/schema/BulkAttributePanel';
import { ReferenceGraph } from '@/features/schema/ReferenceGraph';
import { SchemaDetailPanel } from '@/features/schema/SchemaDetailPanel';
import type { ObjectTypeDefinition, FlattenedObjectType } from '@/domain/model/types';

// ── helpers ────────────────────────────────────────────────────────────────────

function updateObjectTypeRecursively(
  objectTypes: ObjectTypeDefinition[],
  targetExternalId: string,
  updater: (objectType: ObjectTypeDefinition) => ObjectTypeDefinition,
): ObjectTypeDefinition[] {
  return objectTypes.map((objectType) => {
    if (objectType.externalId === targetExternalId) return updater(objectType);
    if (!objectType.children?.length) return objectType;
    return { ...objectType, children: updateObjectTypeRecursively(objectType.children, targetExternalId, updater) };
  });
}

function getParentObjectJsonPath(jsonPath: string): string | undefined {
  if (/\/children\/\d+$/.test(jsonPath)) return jsonPath.replace(/\/children\/\d+$/, '');
  return undefined;
}

function getAncestorObjectJsonPaths(jsonPath: string): string[] {
  const ancestors: string[] = [];
  let current = jsonPath;
  while (true) {
    const parent = getParentObjectJsonPath(current);
    if (!parent) break;
    ancestors.push(parent);
    current = parent;
  }
  return ancestors;
}

function getTypeIcon(name: string, iconKey?: string): string {
  const key = iconKey ?? name ?? '';
  if (/server|host|machine|compute/i.test(key)) return '🖥';
  if (/network|switch|router|device/i.test(key)) return '🌐';
  if (/software|app|application|service|deploy/i.test(key)) return '💿';
  if (/person|people|user|employee|staff/i.test(key)) return '👤';
  if (/location|building|site|office/i.test(key)) return '🏢';
  if (/database|db|data/i.test(key)) return '🗄';
  return '📦';
}

function typePillLabel(type: string, refName?: string): string {
  if (type === 'referenced_object') return `→ ${refName ?? '?'}`;
  return type;
}

function typePillClass(type: string): string {
  if (type === 'referenced_object') return 'bg-blue-50 text-blue-600';
  if (type === 'select' || type === 'status') return 'bg-emerald-50 text-emerald-700';
  return 'bg-slate-100 text-slate-500';
}

// ── component ─────────────────────────────────────────────────────────────────

export function SchemaTree() {
  const {
    document,
    diagnostics,
    deferredDiagnostics,
    focusedPath,
    selectedObjectTypeExternalId,
    setSelectedObjectTypeExternalId,
    updateDocument,
    setActiveView,
    undoDocument,
    redoDocument,
    baselineSnapshots,
    deferDiagnostic,
    undeferDiagnostic,
    stagedForDeletion,
    stageObjectType,
    unstageObjectType,
    clearStagedDeletions,
    commitStagedDeletions,
  } = useDocumentStore(useShallow((state) => ({
    document: state.document,
    diagnostics: state.diagnostics,
    deferredDiagnostics: state.deferredDiagnostics,
    focusedPath: state.focusedPath,
    selectedObjectTypeExternalId: state.selectedObjectTypeExternalId,
    setSelectedObjectTypeExternalId: state.setSelectedObjectTypeExternalId,
    updateDocument: state.updateDocument,
    setActiveView: state.setActiveView,
    undoDocument: state.undoDocument,
    redoDocument: state.redoDocument,
    baselineSnapshots: state.baselineSnapshots,
    deferDiagnostic: state.deferDiagnostic,
    undeferDiagnostic: state.undeferDiagnostic,
    stagedForDeletion: state.stagedForDeletion,
    stageObjectType: state.stageObjectType,
    unstageObjectType: state.unstageObjectType,
    clearStagedDeletions: state.clearStagedDeletions,
    commitStagedDeletions: state.commitStagedDeletions,
  })));

  const [tab, setTab] = useState<'tree' | 'graph' | 'bulk' | 'refs'>('tree');
  const [graphRenderer, setGraphRenderer] = useState<'current' | 'v11'>('current');
  const [isGraphExpanded, setIsGraphExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const [collapsedByPath, setCollapsedByPath] = useState<Record<string, boolean>>({});
  const [expandedAttrPreview, setExpandedAttrPreview] = useState<Set<string>>(new Set());
  const [isCloning, setIsCloning] = useState(false);
  const [cloneExternalId, setCloneExternalId] = useState('');
  const [cloneName, setCloneName] = useState('');
  const [confirmCommit, setConfirmCommit] = useState(false);

  const isDeferredDiagnostic = (code: string, path: string) =>
    deferredDiagnostics.some((d) => d.code === code && d.path === path);

  const stagedSet = useMemo(() => new Set(stagedForDeletion), [stagedForDeletion]);

  // Set of object type externalIds that are staged — used to flag cross-ref attrs in survivors
  const affectedCrossRefAttrs = useMemo<ReadonlySet<string>>(() => {
    // A cross-ref attribute is "affected" when its referenceObjectTypeExternalId is staged.
    // We identify them as `${ownerTypeExternalId}::${attrExternalId}`.
    if (stagedSet.size === 0 || !document) return new Set();
    const doc = document;
    const result = new Set<string>();
    function walk(types: typeof doc.schema.objectSchema.objectTypes): void {
      for (const t of types) {
        if (!stagedSet.has(t.externalId)) {
          for (const attr of t.attributes ?? []) {
            if (
              attr.type === 'referenced_object' &&
              attr.referenceObjectTypeExternalId &&
              stagedSet.has(attr.referenceObjectTypeExternalId)
            ) {
              result.add(`${t.externalId}::${attr.externalId}`);
            }
          }
          walk(t.children ?? []);
        }
      }
    }
    walk(document.schema.objectSchema.objectTypes);
    return result;
  }, [stagedSet, document]);

  const baselineAttributeIds = useMemo<ReadonlySet<string>>(() => {
    const baseline = baselineSnapshots[0];
    if (!baseline) return new Set();
    const ids = new Set<string>();
    flattenObjectTypes(baseline.document.schema.objectSchema.objectTypes).forEach((item) => {
      (item.objectType.attributes ?? []).forEach((attr) => ids.add(attr.externalId));
    });
    return ids;
  }, [baselineSnapshots]);

  const flattened = useMemo(
    () => (document ? flattenObjectTypes(document.schema.objectSchema.objectTypes) : []),
    [document],
  );

  const childCountByJsonPath = useMemo(() => {
    const counts = new Map<string, number>();
    flattened.forEach((item) => {
      const parentPath = getParentObjectJsonPath(item.jsonPath);
      if (parentPath) counts.set(parentPath, (counts.get(parentPath) ?? 0) + 1);
    });
    return counts;
  }, [flattened]);

  const filteredAndVisible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return flattened.filter((item) => {
      if (q && !item.objectType.name.toLowerCase().includes(q) && !item.objectType.externalId.toLowerCase().includes(q)) return false;
      if (q) return true; // show all matches when searching (ignore collapsed)
      const ancestors = getAncestorObjectJsonPaths(item.jsonPath);
      return ancestors.every((path) => !collapsedByPath[path]);
    });
  }, [flattened, collapsedByPath, search]);

  const selected = flattened.find((item) => item.objectType.externalId === selectedObjectTypeExternalId) ?? flattened[0];

  const hasMappingForSelected = selected
    ? (document?.mapping.objectTypeMappings.some((m) => m.objectTypeExternalId === selected.objectType.externalId) ?? false)
    : false;

  const selectedLineage = useMemo(() => {
    if (!selected) return [];
    return selected.path
      .split('/')
      .map((externalId) => flattened.find((item) => item.objectType.externalId === externalId))
      .filter((item): item is FlattenedObjectType => Boolean(item));
  }, [flattened, selected]);

  const conflictingAttributeIds = useMemo(() => new Set(
    diagnostics
      .filter((d) => !isDeferredDiagnostic(d.code, d.path))
      .filter((d) => d.code === 'INHERITED_ATTRIBUTE_TYPE_CONFLICT' && d.metadata?.objectTypeExternalId === selected?.objectType.externalId)
      .map((d) => d.metadata?.attributeExternalId ?? ''),
  ), [diagnostics, deferredDiagnostics, selected]);

  const visibleDiagnostics = useMemo(
    () => diagnostics.filter((d) => !isDeferredDiagnostic(d.code, d.path)),
    [diagnostics, deferredDiagnostics],
  );

  const diagCountByExternalId = useMemo(() => {
    const counts = new Map<string, { errors: number; warnings: number }>();
    visibleDiagnostics.forEach((d) => {
      const id = d.metadata?.objectTypeExternalId;
      if (!id) return;
      const c = counts.get(id) ?? { errors: 0, warnings: 0 };
      if (d.severity === 'error') c.errors++;
      else if (d.severity === 'warning') c.warnings++;
      counts.set(id, c);
    });
    return counts;
  }, [visibleDiagnostics]);

  // Sync selected to focusedPath
  useEffect(() => {
    if (!focusedPath?.startsWith('/schema/objectSchema/objectTypes/')) return;
    const match = flattened
      .filter((item) => focusedPath === item.jsonPath || focusedPath.startsWith(`${item.jsonPath}/`))
      .sort((a, b) => b.jsonPath.length - a.jsonPath.length)[0];
    if (match && match.objectType.externalId !== selectedObjectTypeExternalId) {
      setSelectedObjectTypeExternalId(match.objectType.externalId);
    }
  }, [flattened, focusedPath, selectedObjectTypeExternalId, setSelectedObjectTypeExternalId]);

  // Auto-expand ancestors of selected
  useEffect(() => {
    if (!selected) return;
    const pathsToExpand = getAncestorObjectJsonPaths(selected.jsonPath);
    if (!pathsToExpand.length) return;
    setCollapsedByPath((current) => {
      const next = { ...current };
      let changed = false;
      pathsToExpand.forEach((path) => { if (next[path]) { next[path] = false; changed = true; } });
      return changed ? next : current;
    });
  }, [selected]);

  if (!document) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">No schema loaded.</div>
    );
  }

  const updateSelectedObjectType = (updater: (objectType: ObjectTypeDefinition) => ObjectTypeDefinition) => {
    if (!selected) return;
    updateDocument((current) => ({
      ...current,
      schema: {
        ...current.schema,
        objectSchema: {
          ...current.schema.objectSchema,
          objectTypes: updateObjectTypeRecursively(current.schema.objectSchema.objectTypes, selected.objectType.externalId, updater),
        },
      },
    }));
  };

  const addChildType = () => {
    if (!selected) return;
    updateDocument((current) => ({
      ...current,
      schema: {
        ...current.schema,
        objectSchema: {
          ...current.schema.objectSchema,
          objectTypes: updateObjectTypeRecursively(
            current.schema.objectSchema.objectTypes,
            selected.objectType.externalId,
            (ot) => ({
              ...ot,
              children: [
                ...(ot.children ?? []),
                {
                  externalId: `${ot.externalId}-child-${(ot.children?.length ?? 0) + 1}`,
                  name: `${ot.name} Child ${(ot.children?.length ?? 0) + 1}`,
                  attributes: [],
                },
              ],
            }),
          ),
        },
      },
    }));
  };

  const deleteSelectedType = () => {
    if (!selected) return;
    const deleteFromList = (types: ObjectTypeDefinition[]): ObjectTypeDefinition[] =>
      types
        .filter((t) => t.externalId !== selected.objectType.externalId)
        .map((t) => t.children?.length ? { ...t, children: deleteFromList(t.children) } : t);
    updateDocument((current) => ({
      ...current,
      schema: { ...current.schema, objectSchema: { ...current.schema.objectSchema, objectTypes: deleteFromList(current.schema.objectSchema.objectTypes) } },
    }));
  };

  const toggleAttrPreview = (externalId: string) => {
    setExpandedAttrPreview((prev) => {
      const next = new Set(prev);
      if (next.has(externalId)) next.delete(externalId);
      else next.add(externalId);
      return next;
    });
  };

  const rightPanel = () => {
    if (tab === 'graph') {
      return (
        <div className="flex flex-col gap-2 p-3">
          <div className="flex items-center justify-between">
            <select className="rounded border border-slate-200 bg-white px-2 py-1 text-xs" value={graphRenderer} onChange={(e) => setGraphRenderer(e.target.value as 'current' | 'v11')}>
              <option value="current">Current renderer</option>
              <option value="v11">v11 renderer</option>
            </select>
            <button className="rounded border border-slate-200 bg-white px-2 py-1 text-xs" onClick={() => setIsGraphExpanded(true)}>Full view</button>
          </div>
          {graphRenderer === 'current' ? (
            <SchemaGraph flattened={flattened} selectedExternalId={selected?.objectType.externalId} onSelect={setSelectedObjectTypeExternalId} />
          ) : (
            <SchemaGraphV11 flattened={flattened} selectedExternalId={selected?.objectType.externalId} onSelect={setSelectedObjectTypeExternalId} />
          )}
        </div>
      );
    }
    if (tab === 'bulk') return <div className="p-3"><BulkAttributePanel flattened={flattened} /></div>;
    if (tab === 'refs') return <ReferenceGraph flattened={flattened} selectedExternalId={selected?.objectType.externalId} onSelect={setSelectedObjectTypeExternalId} />;

    if (!selected) return <div className="flex h-64 items-center justify-center text-[13px] text-slate-400">Select a type to inspect it.</div>;

    if (isCloning) {
      return (
        <div className="p-4 space-y-3">
          <div className="text-sm font-semibold text-slate-700">Clone — {selected.objectType.name}</div>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            New external ID
            <input className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-900 outline-none focus:border-blue-400" value={cloneExternalId} onChange={(e) => setCloneExternalId(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            New name
            <input className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-900 outline-none focus:border-blue-400" value={cloneName} onChange={(e) => setCloneName(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <button
              className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={!cloneExternalId.trim() || !cloneName.trim()}
              onClick={() => {
                updateDocument((doc) => cloneObjectType(doc, selected.objectType.externalId, cloneExternalId.trim(), cloneName.trim()));
                setIsCloning(false);
              }}
            >Confirm</button>
            <button className="rounded border border-slate-200 bg-white px-3 py-1 text-xs hover:bg-slate-50" onClick={() => setIsCloning(false)}>Cancel</button>
          </div>
        </div>
      );
    }

    return (
      <SchemaDetailPanel
        selected={selected}
        selectedLineage={selectedLineage}
        diagnostics={visibleDiagnostics}
        deferredDiagnostics={deferredDiagnostics}
        focusedPath={focusedPath}
        baselineAttributeIds={baselineAttributeIds}
        conflictingAttributeIds={conflictingAttributeIds}
        hasMappingForSelected={hasMappingForSelected}
        flattened={flattened}
        onUpdateSelectedObjectType={updateSelectedObjectType}
        onSelect={setSelectedObjectTypeExternalId}
        onGenerateMapping={() => {
          const generated = generateObjectTypeMapping(selected);
          updateDocument((current) => ({
            ...current,
            mapping: { ...current.mapping, objectTypeMappings: [...current.mapping.objectTypeMappings, generated] },
          }));
          setActiveView('mapping');
        }}
        onOpenGenerator={() => setActiveView('generator')}
        onCloneType={() => {
          setCloneExternalId(`${selected.objectType.externalId}_copy`);
          setCloneName(`${selected.objectType.name} (Copy)`);
          setIsCloning(true);
        }}
        onDeleteType={deleteSelectedType}
        onDeferDiagnostic={deferDiagnostic}
        onUndeferDiagnostic={undeferDiagnostic}
        isStaged={stagedSet.has(selected.objectType.externalId)}
        onStageType={() => stageObjectType(selected.objectType.externalId)}
        onUnstageType={() => unstageObjectType(selected.objectType.externalId)}
      />
    );
  };

  return (
    <div className="flex h-[calc(100vh-120px)] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      {/* ── LEFT SIDEBAR ─────────────────────────────────────────────────── */}
      <div className="flex w-64 flex-shrink-0 flex-col border-r border-slate-200 bg-slate-50">
        {/* Tabs */}
        <div className="flex border-b border-slate-200 bg-white">
          {(['tree', 'graph', 'bulk', 'refs'] as const).map((t) => {
            const labels = { tree: 'Schema', graph: 'Graph', bulk: 'Bulk', refs: 'Refs' };
            return (
              <button
                key={t}
                className={`flex-1 py-2 text-[12px] font-medium border-b-2 transition-colors ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                onClick={() => setTab(t)}
              >
                {labels[t]}
              </button>
            );
          })}
        </div>

        {/* Search + add */}
        <div className="flex gap-1.5 border-b border-slate-200 p-2">
          <input
            className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-[12px] outline-none focus:border-blue-400"
            placeholder="Search types…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="rounded bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-700" onClick={addChildType} title="Add child type to selected">
            + Type
          </button>
        </div>

        {/* Undo/redo strip */}
        <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-2 py-1.5">
          <button className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50" onClick={undoDocument}>↩ Undo</button>
          <button className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50" onClick={redoDocument}>↪ Redo</button>
          <button className="ml-auto rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50" onClick={() => setActiveView('validation')}>Validate</button>
        </div>

        {/* Tree */}
        <div className="flex-1 overflow-y-auto py-1">
          {filteredAndVisible.map((item) => {
            const hasChildren = (childCountByJsonPath.get(item.jsonPath) ?? 0) > 0;
            const isCollapsed = Boolean(collapsedByPath[item.jsonPath]);
            const isSelected = item.objectType.externalId === selected?.objectType.externalId;
            const isPreviewing = expandedAttrPreview.has(item.objectType.externalId);
            const diagInfo = diagCountByExternalId.get(item.objectType.externalId);
            const attrs = item.objectType.attributes ?? [];
            const isFocused = !!(focusedPath && (focusedPath === item.jsonPath || focusedPath.startsWith(`${item.jsonPath}/`)));
            const isItemStaged = stagedSet.has(item.objectType.externalId);

            return (
              <div key={item.objectType.externalId}>
                <div
                  className={`flex cursor-pointer items-center gap-1.5 border-l-2 px-2 py-1 transition-colors ${
                    isItemStaged
                      ? 'border-amber-300 bg-amber-50 opacity-60'
                      : isSelected ? 'border-blue-600 bg-blue-50' : isFocused ? 'border-amber-400 bg-amber-50' : 'border-transparent hover:bg-slate-100'
                  }`}
                  style={{ paddingLeft: `${8 + item.depth * 14}px` }}
                  onClick={() => setSelectedObjectTypeExternalId(item.objectType.externalId)}
                >
                  {/* Chevron */}
                  {hasChildren ? (
                    <button
                      className="flex-shrink-0 text-[9px] text-slate-400 w-3 text-center"
                      onClick={(e) => { e.stopPropagation(); setCollapsedByPath((c) => ({ ...c, [item.jsonPath]: !c[item.jsonPath] })); }}
                    >
                      {isCollapsed ? '▶' : '▼'}
                    </button>
                  ) : (
                    <span className="w-3 flex-shrink-0" />
                  )}

                  {/* Icon */}
                  <span className="flex-shrink-0 text-[13px]">{getTypeIcon(item.objectType.name, item.objectType.iconKey)}</span>

                  {/* Name */}
                  <span className={`flex-1 truncate text-[12px] font-medium ${isItemStaged ? 'text-amber-700 line-through' : isSelected ? 'text-blue-800' : 'text-slate-700'}`}>
                    {item.objectType.name}
                  </span>

                  {/* Staged restore button */}
                  {isItemStaged && (
                    <button
                      className="flex-shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 hover:bg-amber-200"
                      title="Restore from staged deletions"
                      onClick={(e) => { e.stopPropagation(); unstageObjectType(item.objectType.externalId); }}
                    >
                      Restore
                    </button>
                  )}

                  {/* Chips (hide diag counts for staged items — they're excluded from validation) */}
                  {!isItemStaged && attrs.length > 0 && (
                    <span
                      className="flex-shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-slate-200 cursor-pointer"
                      title="Toggle attribute preview"
                      onClick={(e) => { e.stopPropagation(); toggleAttrPreview(item.objectType.externalId); }}
                    >
                      {attrs.length}
                    </span>
                  )}
                  {!isItemStaged && diagInfo?.warnings ? (
                    <span className="flex-shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-700">⚠{diagInfo.warnings}</span>
                  ) : null}
                  {!isItemStaged && diagInfo?.errors ? (
                    <span className="flex-shrink-0 rounded bg-red-100 px-1 py-0.5 text-[10px] text-red-700">✕{diagInfo.errors}</span>
                  ) : null}
                </div>

                {/* Attribute preview mini-rows */}
                {isPreviewing && attrs.length > 0 && (
                  <div>
                    {attrs.slice(0, 3).map((attr) => {
                      const attrKey = `${item.objectType.externalId}::${attr.externalId}`;
                      const isAttrAffected = affectedCrossRefAttrs.has(attrKey);
                      return (
                      <div
                        key={attr.externalId}
                        className={`flex items-center gap-1.5 py-0.5 ${isAttrAffected ? 'opacity-60' : 'opacity-75'}`}
                        style={{ paddingLeft: `${24 + item.depth * 14}px` }}
                        title={isAttrAffected ? 'Will be removed — references a staged type' : undefined}
                      >
                        <span className={`h-1 w-1 flex-shrink-0 rounded-full ${isAttrAffected ? 'bg-amber-400' : (attr.minimumCardinality ?? 0) >= 1 ? 'bg-blue-500' : 'bg-slate-300'}`} />
                        <span className={`flex-1 truncate text-[11px] ${isAttrAffected ? 'text-amber-700 line-through' : 'text-slate-600'}`}>{attr.name}</span>
                        <span className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${isAttrAffected ? 'bg-amber-50 text-amber-600' : typePillClass(attr.type)}`}>
                          {typePillLabel(attr.type, attr.referenceObjectTypeName ?? attr.referenceObjectTypeExternalId)}
                        </span>
                      </div>
                      );
                    })}
                    {attrs.length > 3 && (
                      <div className="text-[10px] text-slate-400 py-0.5" style={{ paddingLeft: `${28 + item.depth * 14}px` }}>
                        +{attrs.length - 3} more…
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filteredAndVisible.length === 0 && (
            <div className="px-4 py-6 text-center text-[12px] text-slate-400">No types match "{search}"</div>
          )}
        </div>

        {/* Staging footer */}
        {stagedForDeletion.length > 0 && (
          <div className="border-t border-amber-200 bg-amber-50 px-3 py-2 flex-shrink-0">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] font-medium text-amber-800">
                {stagedForDeletion.length} staged for deletion
              </span>
              <div className="flex gap-1">
                <button
                  className="rounded border border-amber-300 bg-white px-2 py-0.5 text-[10px] text-amber-700 hover:bg-amber-100"
                  onClick={clearStagedDeletions}
                  title="Restore all staged types"
                >
                  Restore all
                </button>
                <button
                  className="rounded border border-red-300 bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700 hover:bg-red-100"
                  onClick={() => setConfirmCommit(true)}
                  title="Permanently delete all staged types"
                >
                  Commit
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT PANEL ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        {rightPanel()}
      </div>

      {/* Commit staged deletions confirmation */}
      {confirmCommit && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px]">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-slate-900">Commit staged deletions?</h3>
            <p className="mt-2 text-[13px] text-slate-600">
              This will permanently remove <strong>{stagedForDeletion.length}</strong> object type(s), their mappings, and any cross-reference attributes pointing to them. This action can be undone with Undo.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded border border-slate-200 bg-white px-3 py-1.5 text-sm" onClick={() => setConfirmCommit(false)}>Cancel</button>
              <button
                className="rounded border border-red-300 bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                onClick={() => { commitStagedDeletions(); setConfirmCommit(false); }}
              >
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-screen graph modal */}
      {isGraphExpanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-6">
          <div className="flex h-full w-full max-w-[1500px] flex-col gap-3 rounded-xl border border-slate-300 bg-white p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Schema Graph — Full View</h3>
              <button className="rounded bg-slate-900 px-3 py-1 text-xs text-white" onClick={() => setIsGraphExpanded(false)}>Close</button>
            </div>
            {graphRenderer === 'current' ? (
              <SchemaGraph flattened={flattened} selectedExternalId={selected?.objectType.externalId} onSelect={setSelectedObjectTypeExternalId} heightClassName="h-[calc(100vh-140px)]" />
            ) : (
              <SchemaGraphV11 flattened={flattened} selectedExternalId={selected?.objectType.externalId} onSelect={setSelectedObjectTypeExternalId} heightClassName="h-[calc(100vh-140px)]" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
