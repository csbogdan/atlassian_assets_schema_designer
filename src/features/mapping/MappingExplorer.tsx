'use client';

import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useDocumentStore } from '@/stores/documentStore';
import { flattenObjectTypes } from '@/domain/selectors/indexes';
import { computeMappingCompleteness } from '@/domain/selectors/mappingCompleteness';
import { buildDeadMappingIndex } from '@/domain/selectors/deadMappings';
import { MappingDetailPanel } from '@/features/mapping/MappingDetailPanel';
import type { ObjectTypeMappingDefinition } from '@/domain/model/types';

type SidebarTab = 'mappings' | 'coverage';

function getTypeIcon(name: string): string {
  if (/server|host|machine|compute/i.test(name)) return '🖥';
  if (/network|switch|router|device/i.test(name)) return '🌐';
  if (/software|app|application|service|deploy/i.test(name)) return '💿';
  if (/person|people|user|employee|staff/i.test(name)) return '👤';
  if (/location|building|site|office/i.test(name)) return '🏢';
  if (/database|db|data/i.test(name)) return '🗄';
  return '📦';
}

export function MappingExplorer() {
  const {
    document,
    focusedPath,
    updateDocument,
    setActiveView,
    undoDocument,
    redoDocument,
    selectedMappingExternalId,
    setSelectedMappingExternalId,
    diagnostics,
  } = useDocumentStore(useShallow((state) => ({
    document: state.document,
    focusedPath: state.focusedPath,
    updateDocument: state.updateDocument,
    setActiveView: state.setActiveView,
    undoDocument: state.undoDocument,
    redoDocument: state.redoDocument,
    selectedMappingExternalId: state.selectedMappingExternalId,
    setSelectedMappingExternalId: state.setSelectedMappingExternalId,
    diagnostics: state.diagnostics,
  })));

  const [tab, setTab] = useState<SidebarTab>('mappings');
  const [search, setSearch] = useState('');
  const [expandedCoverageId, setExpandedCoverageId] = useState<string | null>(null);

  const deadIndex = useMemo(() => buildDeadMappingIndex(diagnostics), [diagnostics]);
  const objectTypeOptions = useMemo(
    () => (document ? flattenObjectTypes(document.schema.objectSchema.objectTypes) : []),
    [document],
  );

  const allMappings = document?.mapping.objectTypeMappings ?? [];
  const mappings = useMemo(() => {
    if (!search.trim()) return allMappings;
    const q = search.toLowerCase();
    return allMappings.filter((m) =>
      `${m.objectTypeExternalId} ${m.objectTypeName ?? ''} ${m.selector}`.toLowerCase().includes(q),
    );
  }, [allMappings, search]);

  const completeness = useMemo(
    () => (document ? computeMappingCompleteness(document) : []),
    [document],
  );
  const sortedCompleteness = useMemo(
    () =>
      [...completeness].sort((a, b) => {
        if (!a.hasMapping && b.hasMapping) return -1;
        if (a.hasMapping && !b.hasMapping) return 1;
        return a.coveragePercent - b.coveragePercent;
      }),
    [completeness],
  );

  // Sync focusedPath → selection
  useEffect(() => {
    if (!focusedPath?.startsWith('/mapping/objectTypeMappings/')) return;
    const mappingIndex = Number(focusedPath.split('/')[3]);
    if (Number.isNaN(mappingIndex)) return;
    const mapping = document?.mapping.objectTypeMappings[mappingIndex];
    if (mapping && mapping.objectTypeExternalId !== selectedMappingExternalId) {
      setSelectedMappingExternalId(mapping.objectTypeExternalId);
    }
  }, [document, focusedPath, selectedMappingExternalId, setSelectedMappingExternalId]);

  if (!document) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-slate-400">
        <div className="text-sm">No document loaded.</div>
        <div className="flex gap-2">
          <button className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700" onClick={() => setActiveView('project')}>Open Project</button>
          <button className="rounded border border-slate-200 bg-white px-3 py-1.5 text-xs hover:bg-slate-50" onClick={() => setActiveView('raw-json')}>Raw JSON</button>
        </div>
      </div>
    );
  }

  const selectedMapping = selectedMappingExternalId
    ? allMappings.find((m) => m.objectTypeExternalId === selectedMappingExternalId) ?? null
    : null;

  const updateSelectedMapping = (updater: (mapping: ObjectTypeMappingDefinition) => ObjectTypeMappingDefinition) => {
    if (!selectedMappingExternalId) return;
    updateDocument((current) => ({
      ...current,
      mapping: {
        ...current.mapping,
        objectTypeMappings: current.mapping.objectTypeMappings.map((m) =>
          m.objectTypeExternalId === selectedMappingExternalId ? updater(m) : m,
        ),
      },
    }));
  };

  const removeSelectedMapping = () => {
    if (!selectedMappingExternalId) return;
    updateDocument((current) => ({
      ...current,
      mapping: {
        ...current.mapping,
        objectTypeMappings: current.mapping.objectTypeMappings.filter(
          (m) => m.objectTypeExternalId !== selectedMappingExternalId,
        ),
      },
    }));
    setSelectedMappingExternalId(undefined);
  };

  const coveragePanel = (
    <div className="flex-1 overflow-y-auto px-4 py-2">
      <div className="mb-2 grid grid-cols-[minmax(0,1fr)_8rem_6rem] gap-2 border-b border-slate-200 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        <div>Type</div>
        <div>Coverage</div>
        <div>Mapped</div>
      </div>
      <div className="space-y-0.5">
        {sortedCompleteness.map((item) => {
          const isExpanded = expandedCoverageId === item.objectTypeExternalId;
          const unmapped = item.attributes.filter((a) => !a.isMapped);
          const mapped = item.attributes.filter((a) => a.isMapped);
          return (
            <div key={item.objectTypeExternalId}>
              <button
                className={`grid w-full grid-cols-[minmax(0,1fr)_8rem_6rem] items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${isExpanded ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                onClick={() => setExpandedCoverageId(isExpanded ? null : item.objectTypeExternalId)}
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-slate-800">{item.objectTypeName}</div>
                  <div className="truncate font-mono text-[10px] text-slate-400">{item.objectTypeExternalId}</div>
                </div>
                <div className="flex items-center gap-2">
                  {item.hasMapping ? (
                    <>
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${item.coveragePercent}%` }} />
                      </div>
                      <span className="w-8 text-right text-[11px] text-slate-600">{item.coveragePercent}%</span>
                    </>
                  ) : (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">No mapping</span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500">
                  {item.hasMapping ? `${item.mappedAttributes} / ${item.totalAttributes}` : '—'}
                </div>
              </button>

              {isExpanded && (
                <div className="mx-2 mb-2 rounded-md border border-slate-200 bg-white text-[12px]">
                  {/* Navigate to detail */}
                  <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5">
                    <span className="text-[11px] text-slate-500">Attribute coverage</span>
                    <button
                      className="text-[11px] text-blue-600 hover:underline"
                      onClick={() => { setSelectedMappingExternalId(item.objectTypeExternalId); setTab('mappings'); }}
                    >
                      View mapping →
                    </button>
                  </div>
                  {unmapped.length > 0 && (
                    <div className="px-3 py-2">
                      <div className="mb-1 text-[11px] font-semibold text-amber-600">
                        Not mapped ({unmapped.length})
                      </div>
                      <div className="space-y-0.5">
                        {unmapped.map((a) => (
                          <div key={a.attributeExternalId} className="flex items-center gap-2 rounded bg-amber-50 px-2 py-1">
                            <span className="flex-1 truncate text-slate-700">{a.attributeName}</span>
                            <span className="font-mono text-[10px] text-slate-400">{a.attributeExternalId}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {mapped.length > 0 && (
                    <div className="border-t border-slate-100 px-3 py-2">
                      <div className="mb-1 text-[11px] font-semibold text-emerald-600">
                        Mapped ({mapped.length})
                      </div>
                      <div className="space-y-0.5">
                        {mapped.map((a) => (
                          <div key={a.attributeExternalId} className="flex items-center gap-2 rounded bg-emerald-50 px-2 py-1">
                            <span className="flex-1 truncate text-slate-700">{a.attributeName}</span>
                            <span className="font-mono text-[10px] text-slate-400">{a.attributeExternalId}</span>
                            <span className="text-[10px] text-emerald-600">{a.locatorsCount} locator{a.locatorsCount !== 1 ? 's' : ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {item.attributes.length === 0 && (
                    <div className="px-3 py-2 text-[11px] text-slate-400">No attributes defined.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {sortedCompleteness.length === 0 && (
          <div className="py-6 text-center text-[12px] text-slate-400">No object types found.</div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-120px)] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      {/* ── LEFT SIDEBAR ─────────────────────────────────────────────────── */}
      <div className="flex w-64 flex-shrink-0 flex-col border-r border-slate-200 bg-slate-50">
        {/* Tabs */}
        <div className="flex border-b border-slate-200 bg-white">
          {(['mappings', 'coverage'] as const).map((t) => (
            <button
              key={t}
              className={`flex-1 py-2 text-[12px] font-medium capitalize border-b-2 transition-colors ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="border-b border-slate-200 p-2">
          <input
            className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-[12px] outline-none focus:border-blue-400"
            placeholder="Search mappings…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Undo/Redo strip */}
        <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-2 py-1.5">
          <button className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50" onClick={undoDocument}>↩ Undo</button>
          <button className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50" onClick={redoDocument}>↪ Redo</button>
          <button className="ml-auto rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50" onClick={() => setActiveView('validation')}>Validate</button>
        </div>

        {/* Dead mappings banner */}
        {deadIndex.deadObjectTypeExternalIds.size > 0 && (
          <div className="border-b border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
            {deadIndex.deadObjectTypeExternalIds.size} dead mapping{deadIndex.deadObjectTypeExternalIds.size > 1 ? 's' : ''} — types missing from schema
          </div>
        )}

        {/* Mapping list */}
        <div className="flex-1 overflow-y-auto py-1">
          {mappings.map((mapping) => {
            const isSelected = mapping.objectTypeExternalId === selectedMappingExternalId;
            const isDead = deadIndex.deadObjectTypeExternalIds.has(mapping.objectTypeExternalId);
            const isFocused = (() => {
              if (!focusedPath) return false;
              const idx = document.mapping.objectTypeMappings.findIndex((m) => m.objectTypeExternalId === mapping.objectTypeExternalId);
              return focusedPath.startsWith(`/mapping/objectTypeMappings/${idx}`);
            })();
            const attrCount = mapping.attributesMapping.length;

            return (
              <div
                key={mapping.objectTypeExternalId}
                className={`flex cursor-pointer items-center gap-1.5 border-l-2 px-2 py-1.5 transition-colors ${
                  isSelected ? 'border-blue-600 bg-blue-50' :
                  isFocused ? 'border-amber-400 bg-amber-50' :
                  'border-transparent hover:bg-slate-100'
                }`}
                onClick={() => setSelectedMappingExternalId(mapping.objectTypeExternalId)}
              >
                <span className="flex-shrink-0 text-[13px]">{getTypeIcon(mapping.objectTypeName ?? mapping.objectTypeExternalId)}</span>
                <div className="flex-1 min-w-0">
                  <div className={`truncate text-[12px] font-medium ${isSelected ? 'text-blue-800' : 'text-slate-700'}`}>
                    {mapping.objectTypeName ?? mapping.objectTypeExternalId}
                  </div>
                  <div className="truncate font-mono text-[10px] text-slate-400">{mapping.selector || '—'}</div>
                </div>
                {attrCount > 0 && (
                  <span className="flex-shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{attrCount}</span>
                )}
                {isDead && (
                  <span className="flex-shrink-0 rounded bg-red-100 px-1 py-0.5 text-[10px] font-semibold text-red-700">Dead</span>
                )}
              </div>
            );
          })}

          {mappings.length === 0 && (
            <div className="px-4 py-6 text-center">
              <div className="text-[12px] text-slate-400">
                {search ? `No mappings match "${search}"` : 'No mappings yet'}
              </div>
              {!search && (
                <button className="mt-2 text-[11px] text-blue-600 hover:underline" onClick={() => setActiveView('generator')}>
                  Open Generator →
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'coverage' ? (
          <div className="flex h-full flex-col">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Coverage Report
            </div>
            {coveragePanel}
          </div>
        ) : !selectedMapping ? (
          <div className="flex h-64 items-center justify-center text-[13px] text-slate-400">
            Select a mapping to view details.
          </div>
        ) : (() => {
          const mappingIndex = document.mapping.objectTypeMappings.findIndex(
            (m) => m.objectTypeExternalId === selectedMapping.objectTypeExternalId,
          );
          const objectType = objectTypeOptions.find(
            (item) => item.objectType.externalId === selectedMapping.objectTypeExternalId,
          );
          const attrOptions = objectType?.effectiveAttributes ?? [];
          return (
            <MappingDetailPanel
              mapping={selectedMapping}
              objectType={objectType}
              schemaAttributeOptions={attrOptions}
              deadIndex={deadIndex}
              focusedPath={focusedPath}
              mappingIndex={mappingIndex}
              onUpdate={updateSelectedMapping}
              onRemove={removeSelectedMapping}
              onOpenSchema={() => setActiveView('schema')}
              onOpenGenerator={() => setActiveView('generator')}
            />
          );
        })()}
      </div>
    </div>
  );
}
