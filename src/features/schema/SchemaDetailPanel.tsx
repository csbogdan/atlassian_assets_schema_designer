'use client';

import { useState } from 'react';
import type { Diagnostic, FlattenedObjectType, ObjectAttributeDefinition, ObjectTypeDefinition } from '@/domain/model/types';
import { MoveAttributesPanel } from '@/features/schema/MoveAttributesPanel';

const ATTR_TYPES = ['text', 'textarea', 'integer', 'double', 'boolean', 'date', 'time', 'date_time', 'email', 'url', 'status', 'referenced_object', 'select', 'ipaddress'] as const;

function typePillClass(type: string): string {
  if (type === 'referenced_object') return 'bg-blue-50 text-blue-700';
  if (type === 'select' || type === 'status') return 'bg-emerald-50 text-emerald-700';
  return 'bg-slate-100 text-slate-600';
}

function typePillLabel(attr: ObjectAttributeDefinition): string {
  if (attr.type === 'referenced_object') return `→ ${attr.referenceObjectTypeName ?? attr.referenceObjectTypeExternalId ?? '?'}`;
  return attr.type;
}

function isRequired(attr: ObjectAttributeDefinition): boolean {
  return (attr.minimumCardinality ?? 0) >= 1;
}

interface Props {
  selected: FlattenedObjectType;
  selectedLineage: FlattenedObjectType[];
  diagnostics: Diagnostic[];
  deferredDiagnostics: Array<{ code: string; path: string }>;
  focusedPath: string | undefined;
  baselineAttributeIds: ReadonlySet<string>;
  conflictingAttributeIds: Set<string>;
  hasMappingForSelected: boolean;
  flattened: FlattenedObjectType[];
  onUpdateSelectedObjectType: (updater: (objectType: ObjectTypeDefinition) => ObjectTypeDefinition) => void;
  onSelect: (externalId: string) => void;
  onGenerateMapping: () => void;
  onOpenGenerator: () => void;
  onCloneType: () => void;
  onDeleteType: () => void;
  onDeferDiagnostic: (code: string, path: string) => void;
  onUndeferDiagnostic: (code: string, path: string) => void;
  isStaged?: boolean;
  onStageType?: () => void;
  onUnstageType?: () => void;
}

export function SchemaDetailPanel({
  selected,
  selectedLineage,
  diagnostics,
  deferredDiagnostics,
  focusedPath,
  baselineAttributeIds,
  conflictingAttributeIds,
  hasMappingForSelected,
  flattened,
  onUpdateSelectedObjectType,
  onSelect,
  onGenerateMapping,
  onOpenGenerator,
  onCloneType,
  onDeleteType,
  onDeferDiagnostic,
  onUndeferDiagnostic,
  isStaged = false,
  onStageType,
  onUnstageType,
}: Props) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [showTypeSettings, setShowTypeSettings] = useState(false);
  const [expandedAttrIds, setExpandedAttrIds] = useState<Set<string>>(new Set());
  const [isAddingAttr, setIsAddingAttr] = useState(false);
  const [isMoveMode, setIsMoveMode] = useState(false);

  const toggleAttr = (externalId: string) =>
    setExpandedAttrIds((prev) => {
      const next = new Set(prev);
      if (next.has(externalId)) next.delete(externalId); else next.add(externalId);
      return next;
    });
  const [newAttrName, setNewAttrName] = useState('');
  const [newAttrExternalId, setNewAttrExternalId] = useState('');
  const [newAttrType, setNewAttrType] = useState('text');
  const [newAttrMinCard, setNewAttrMinCard] = useState<number | ''>('');
  const [newAttrMaxCard, setNewAttrMaxCard] = useState<number | ''>('');
  const [newAttrRefId, setNewAttrRefId] = useState('');
  const [newAttrTypeValues, setNewAttrTypeValues] = useState('');
  const [newAttrDescription, setNewAttrDescription] = useState('');
  const [newAttrLabel, setNewAttrLabel] = useState(false);
  const [newAttrUnique, setNewAttrUnique] = useState(false);

  const attrs = selected.objectType.attributes ?? [];
  const requiredCount = attrs.filter(isRequired).length;
  const mappingCount = 0; // placeholder

  const typeDiagnostics = diagnostics.filter(
    (d) => d.path.startsWith(selected.jsonPath) || d.metadata?.objectTypeExternalId === selected.objectType.externalId,
  );

  const startRename = () => {
    setRenameValue(selected.objectType.name);
    setIsRenaming(true);
  };

  const confirmRename = () => {
    if (renameValue.trim()) {
      onUpdateSelectedObjectType((ot) => ({ ...ot, name: renameValue.trim() }));
    }
    setIsRenaming(false);
  };

  const deriveExternalId = (name: string) =>
    `${selected.objectType.externalId}-${name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '')}`;

  const resetAddForm = () => {
    setNewAttrName('');
    setNewAttrExternalId('');
    setNewAttrType('text');
    setNewAttrMinCard('');
    setNewAttrMaxCard('');
    setNewAttrRefId('');
    setNewAttrTypeValues('');
    setNewAttrDescription('');
    setNewAttrLabel(false);
    setNewAttrUnique(false);
    setIsAddingAttr(false);
  };

  const addAttr = () => {
    if (!newAttrName.trim()) return;
    const refMatch = newAttrRefId ? flattened.find((f) => f.objectType.externalId === newAttrRefId) : undefined;
    const newAttr: ObjectAttributeDefinition = {
      externalId: newAttrExternalId.trim() || deriveExternalId(newAttrName),
      name: newAttrName.trim(),
      type: newAttrType,
      ...(newAttrDescription.trim() ? { description: newAttrDescription.trim() } : {}),
      ...(newAttrMinCard !== '' ? { minimumCardinality: newAttrMinCard } : {}),
      ...(newAttrMaxCard !== '' ? { maximumCardinality: newAttrMaxCard } : {}),
      ...(newAttrType === 'referenced_object' && newAttrRefId ? { referenceObjectTypeExternalId: newAttrRefId, referenceObjectTypeName: refMatch?.objectType.name } : {}),
      ...(newAttrType === 'status' && newAttrTypeValues.trim() ? { typeValues: newAttrTypeValues.split(',').map((v) => v.trim()).filter(Boolean) } : {}),
      ...(newAttrLabel ? { label: true } : {}),
      ...(newAttrUnique ? { unique: true } : {}),
    };
    onUpdateSelectedObjectType((ot) => ({ ...ot, attributes: [...(ot.attributes ?? []), newAttr] }));
    resetAddForm();
  };

  const updateAttr = (index: number, patch: Partial<ObjectAttributeDefinition>) => {
    onUpdateSelectedObjectType((ot) => ({
      ...ot,
      attributes: (ot.attributes ?? []).map((a, i) => i === index ? { ...a, ...patch } : a),
    }));
  };

  const duplicateAttr = (index: number) => {
    onUpdateSelectedObjectType((ot) => {
      const list = ot.attributes ?? [];
      const src = list[index];
      if (!src) return ot;
      const dup = { ...src, externalId: `${src.externalId}_copy`, name: `${src.name} Copy` };
      return { ...ot, attributes: [...list.slice(0, index + 1), dup, ...list.slice(index + 1)] };
    });
  };

  const removeAttr = (index: number) => {
    const externalId = attrs[index]?.externalId;
    onUpdateSelectedObjectType((ot) => ({
      ...ot,
      attributes: (ot.attributes ?? []).filter((_, i) => i !== index),
    }));
    if (externalId) setExpandedAttrIds((prev) => { const next = new Set(prev); next.delete(externalId); return next; });
  };

  const parentName = selected.parentExternalId
    ? flattened.find((f) => f.objectType.externalId === selected.parentExternalId)?.objectType.name
    : undefined;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
        <span className="text-blue-600 cursor-pointer hover:underline" onClick={() => onSelect(selectedLineage[0]?.objectType.externalId ?? selected.objectType.externalId)}>
          Schema
        </span>
        {selectedLineage.slice(0, -1).map((node) => (
          <span key={node.objectType.externalId} className="flex items-center gap-1">
            <span className="text-slate-300">›</span>
            <span className="cursor-pointer text-blue-600 hover:underline" onClick={() => onSelect(node.objectType.externalId)}>
              {node.objectType.name}
            </span>
          </span>
        ))}
        <span className="text-slate-300">›</span>
        <span className="font-medium text-slate-700">{selected.objectType.name}</span>
      </div>

      {/* Type header */}
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-xl cursor-pointer hover:bg-blue-100" title="Icon">
          {getTypeIcon(selected.objectType)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {isRenaming ? (
              <input
                autoFocus
                className="border-b-2 border-blue-400 bg-transparent text-[15px] font-semibold text-slate-800 outline-none w-48 px-0.5"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={confirmRename}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') confirmRename(); }}
              />
            ) : (
              <span className="text-[15px] font-semibold text-slate-800">{selected.objectType.name}</span>
            )}
            <button
              className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
              onClick={startRename}
            >
              Rename
            </button>
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-slate-400">
            {selected.objectType.externalId}
            {parentName ? ` · parent: ${parentName}` : ''}
            {hasMappingForSelected ? ' · mapped' : ' · no mapping'}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          {isStaged ? (
            <button
              className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-100"
              onClick={onUnstageType}
              title="Restore this type from staged deletions"
            >
              Restore
            </button>
          ) : (
            <>
              <button
                className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={hasMappingForSelected}
                onClick={onGenerateMapping}
                title={hasMappingForSelected ? 'Mapping exists' : 'Generate mapping'}
              >
                {hasMappingForSelected ? 'Mapped' : '+ Mapping'}
              </button>
              <button className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-[13px] text-slate-600 hover:bg-slate-50" title="Clone type" onClick={onCloneType}>⧉</button>
              {onStageType && (
                <button
                  className="flex h-7 items-center justify-center rounded border border-amber-200 bg-white px-1.5 text-[11px] text-amber-600 hover:bg-amber-50"
                  title="Stage for deletion (soft-delete, reversible)"
                  onClick={onStageType}
                >
                  Stage
                </button>
              )}
              <button className="flex h-7 w-7 items-center justify-center rounded border border-red-100 bg-white text-[13px] text-red-500 hover:bg-red-50" title="Delete type permanently" onClick={onDeleteType}>🗑</button>
            </>
          )}
        </div>
      </div>

      {isStaged && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-[12px] text-amber-800">
          Staged for deletion — excluded from validation and export. Click <strong>Restore</strong> to bring it back.
        </div>
      )}

      {/* Type settings (collapsible) */}
      <div className="border-b border-slate-200">
        <button
          className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-slate-50 transition-colors"
          onClick={() => setShowTypeSettings((v) => !v)}
        >
          <span className="text-[9px] text-slate-400">{showTypeSettings ? '▼' : '▶'}</span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Type Settings</span>
          {(selected.objectType.inheritance || selected.objectType.abstractObject) && (
            <div className="ml-2 flex gap-1">
              {selected.objectType.inheritance && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-600">inheritance</span>}
              {selected.objectType.abstractObject && <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] text-purple-600">abstract</span>}
            </div>
          )}
        </button>
        {showTypeSettings && (
          <div className="grid grid-cols-2 gap-2 px-4 pb-3">
            <label className="flex flex-col gap-0.5 text-[11px] text-slate-600">
              External ID
              <input
                className="rounded border border-slate-200 bg-white px-2 py-1 text-[12px] font-mono text-slate-900 outline-none focus:border-blue-400"
                value={selected.objectType.externalId}
                onChange={(e) => onUpdateSelectedObjectType((ot) => ({ ...ot, externalId: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] text-slate-600">
              Icon key
              <input
                className="rounded border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-900 outline-none focus:border-blue-400"
                value={selected.objectType.iconKey ?? ''}
                placeholder="e.g. server, laptop"
                onChange={(e) => onUpdateSelectedObjectType((ot) => ({ ...ot, iconKey: e.target.value || undefined }))}
              />
            </label>
            <label className="col-span-2 flex flex-col gap-0.5 text-[11px] text-slate-600">
              Description
              <textarea
                rows={2}
                className="resize-none rounded border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-900 outline-none focus:border-blue-400"
                value={selected.objectType.description ?? ''}
                placeholder="Optional description"
                onChange={(e) => onUpdateSelectedObjectType((ot) => ({ ...ot, description: e.target.value || undefined }))}
              />
            </label>
            <label className="flex items-start gap-2 text-[11px] text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={Boolean(selected.objectType.inheritance)}
                onChange={(e) => onUpdateSelectedObjectType((ot) => ({ ...ot, inheritance: e.target.checked || undefined }))}
              />
              <div>
                <div className="font-medium text-slate-700">Inheritance</div>
                <div className="text-[10px] text-slate-400">Child types inherit this type's attributes</div>
              </div>
            </label>
            <label className="flex items-start gap-2 text-[11px] text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={Boolean(selected.objectType.abstractObject)}
                onChange={(e) => onUpdateSelectedObjectType((ot) => ({ ...ot, abstractObject: e.target.checked || undefined }))}
              />
              <div>
                <div className="font-medium text-slate-700">Abstract object</div>
                <div className="text-[10px] text-slate-400">Cannot be instantiated directly — only through child types</div>
              </div>
            </label>
          </div>
        )}
      </div>

      {/* Attributes */}
      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Attributes
          </span>
          <span className="text-[11px] text-slate-400">
            {attrs.length} total · {requiredCount} required
            {expandedAttrIds.size > 0 && <span className="ml-1 text-blue-500">· {expandedAttrIds.size} open</span>}
          </span>
          <div className="ml-auto flex gap-1.5">
            {expandedAttrIds.size > 0 && (
              <button
                className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                title="Move selected attributes to another type"
                onClick={() => setIsMoveMode(true)}
              >↕ Move selected</button>
            )}
            <button className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50" onClick={onOpenGenerator}>Bulk ops</button>
            <button className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50" onClick={() => setIsAddingAttr(true)}>+ Add</button>
          </div>
        </div>

        <div className="px-4 py-2 space-y-0.5">
          {attrs.length === 0 && !isAddingAttr && (
            <div className="py-4 text-center text-[12px] text-slate-400">No attributes — add one below</div>
          )}

          {attrs.map((attr, index) => {
            const isExpanded = expandedAttrIds.has(attr.externalId);
            const isFocused = !!(focusedPath && selected && focusedPath.startsWith(`${selected.jsonPath}/attributes/${index}`));
            const isConflict = conflictingAttributeIds.has(attr.externalId);
            const isBaseline = baselineAttributeIds.has(attr.externalId);

            return (
              <div key={`${attr.externalId}-${index}`}>
                <div
                  className={`group flex items-center gap-2 rounded-md border px-2 py-1.5 cursor-pointer transition-colors ${
                    isFocused ? 'border-amber-300 bg-amber-50 ring-1 ring-amber-200' :
                    isExpanded ? 'border-blue-300 bg-blue-50/30' :
                    'border-transparent hover:border-slate-200 hover:bg-slate-50'
                  }`}
                  onClick={() => toggleAttr(attr.externalId)}
                >
                  <span className="cursor-grab text-[12px] text-slate-300 group-hover:text-slate-400">⠿</span>
                  <span
                    className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${isRequired(attr) ? 'bg-blue-500' : 'bg-slate-300'}`}
                    title={isRequired(attr) ? 'Required' : 'Optional'}
                  />
                  <div className="flex flex-1 items-center gap-2 min-w-0">
                    <span className={`text-[13px] font-medium text-slate-800 min-w-[100px] ${isConflict ? 'text-amber-700' : ''}`}>
                      {attr.name}
                      {isConflict && <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-700">type conflict</span>}
                    </span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${typePillClass(attr.type)}`}>
                      {typePillLabel(attr)}
                    </span>
                    {isRequired(attr) && <span className="text-[11px] text-slate-400">— required</span>}
                    {isBaseline && <span className="text-[10px] text-slate-400" title="Type locked after first sync">🔒</span>}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    <button
                      className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-[13px] text-slate-600 hover:bg-slate-50"
                      title="Duplicate"
                      onClick={(e) => { e.stopPropagation(); duplicateAttr(index); }}
                    >⧉</button>
                    <button
                      className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-[13px] text-slate-600 hover:bg-slate-50"
                      title="Move to another type"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedAttrIds((prev) => { const next = new Set(prev); next.add(attr.externalId); return next; });
                        setIsMoveMode(true);
                      }}
                    >↕</button>
                    <button
                      className="flex h-7 w-7 items-center justify-center rounded border border-red-100 bg-white text-[13px] text-red-500 hover:bg-red-50"
                      title="Delete"
                      onClick={(e) => { e.stopPropagation(); removeAttr(index); }}
                    >✕</button>
                  </div>
                </div>

                {/* Inline expanded editor */}
                {isExpanded && (
                  <div className="mx-2 mb-1 rounded-md border border-blue-200 bg-slate-50 px-3 py-2.5 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-0.5 text-[11px] text-slate-600">
                        Name
                        <input
                          className="rounded border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-900 outline-none focus:border-blue-400"
                          value={attr.name}
                          onChange={(e) => updateAttr(index, { name: e.target.value })}
                        />
                      </label>
                      <label className="flex flex-col gap-0.5 text-[11px] text-slate-600">
                        External ID
                        <input
                          className="rounded border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-900 outline-none focus:border-blue-400"
                          value={attr.externalId}
                          onChange={(e) => updateAttr(index, { externalId: e.target.value })}
                        />
                      </label>
                      <label className="col-span-2 flex flex-col gap-0.5 text-[11px] text-slate-600">
                        Type
                        {isBaseline && <span className="text-[10px] text-slate-400">Locked after first sync — drop and recreate to change</span>}
                        <select
                          className="rounded border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-900 outline-none focus:border-blue-400 disabled:bg-slate-100 disabled:text-slate-400"
                          value={attr.type}
                          disabled={isBaseline}
                          onChange={(e) => updateAttr(index, { type: e.target.value })}
                        >
                          {ATTR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </label>
                      {attr.type === 'referenced_object' && (
                        <>
                          <label className="col-span-2 flex flex-col gap-0.5 text-[11px] text-slate-600">
                            Referenced type (external ID)
                            <input
                              list="ref-extid-list"
                              className="rounded border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-900 outline-none focus:border-blue-400"
                              value={attr.referenceObjectTypeExternalId ?? ''}
                              onChange={(e) => {
                                const match = flattened.find((f) => f.objectType.externalId === e.target.value);
                                updateAttr(index, {
                                  referenceObjectTypeExternalId: e.target.value,
                                  referenceObjectTypeName: match?.objectType.name ?? attr.referenceObjectTypeName,
                                });
                              }}
                            />
                            <datalist id="ref-extid-list">
                              {flattened.map((f) => <option key={f.objectType.externalId} value={f.objectType.externalId}>{f.objectType.name}</option>)}
                            </datalist>
                          </label>
                        </>
                      )}
                      {attr.type === 'status' && (
                        <label className="col-span-2 flex flex-col gap-0.5 text-[11px] text-slate-600">
                          Options (comma-separated)
                          <input
                            className="rounded border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-900 outline-none focus:border-blue-400"
                            value={(attr.typeValues ?? []).join(', ')}
                            onChange={(e) => updateAttr(index, { typeValues: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })}
                          />
                        </label>
                      )}
                      <label className="flex flex-col gap-0.5 text-[11px] text-slate-600">
                        Min cardinality
                        <input type="number" min={0} className="rounded border border-slate-200 bg-white px-2 py-1 text-[12px] outline-none focus:border-blue-400" value={attr.minimumCardinality ?? ''} onChange={(e) => updateAttr(index, { minimumCardinality: e.target.value === '' ? undefined : Number(e.target.value) })} />
                      </label>
                      <label className="flex flex-col gap-0.5 text-[11px] text-slate-600">
                        Max cardinality
                        <input type="number" min={0} className="rounded border border-slate-200 bg-white px-2 py-1 text-[12px] outline-none focus:border-blue-400" value={attr.maximumCardinality ?? ''} onChange={(e) => updateAttr(index, { maximumCardinality: e.target.value === '' ? undefined : Number(e.target.value) })} />
                      </label>
                      <div className="col-span-2 flex gap-4">
                        <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                          <input type="checkbox" checked={Boolean(attr.label)} onChange={(e) => updateAttr(index, { label: e.target.checked })} />
                          Label field
                        </label>
                        <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                          <input type="checkbox" checked={Boolean(attr.unique)} onChange={(e) => updateAttr(index, { unique: e.target.checked })} />
                          Unique
                        </label>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50" onClick={() => toggleAttr(attr.externalId)}>Done</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Inline add form */}
          {isAddingAttr ? (
            <div className="rounded-md border-2 border-dashed border-blue-300 bg-blue-50/10 px-3 py-3 space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-500">New Attribute</div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-0.5 text-[11px] text-slate-600">
                  Name <span className="text-red-400">*</span>
                  <input
                    autoFocus
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-900 outline-none focus:border-blue-400"
                    placeholder="e.g. hostname"
                    value={newAttrName}
                    onChange={(e) => {
                      setNewAttrName(e.target.value);
                      if (!newAttrExternalId) setNewAttrExternalId(deriveExternalId(e.target.value));
                    }}
                    onKeyDown={(e) => { if (e.key === 'Escape') resetAddForm(); }}
                  />
                </label>
                <label className="flex flex-col gap-0.5 text-[11px] text-slate-600">
                  External ID
                  <input
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-900 outline-none focus:border-blue-400 font-mono"
                    placeholder="auto-generated"
                    value={newAttrExternalId}
                    onChange={(e) => setNewAttrExternalId(e.target.value)}
                  />
                </label>
                <label className="col-span-2 flex flex-col gap-0.5 text-[11px] text-slate-600">
                  Type
                  <select
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-900 outline-none focus:border-blue-400"
                    value={newAttrType}
                    onChange={(e) => { setNewAttrType(e.target.value); setNewAttrRefId(''); setNewAttrTypeValues(''); }}
                  >
                    {ATTR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>

                {newAttrType === 'referenced_object' && (
                  <label className="col-span-2 flex flex-col gap-0.5 text-[11px] text-slate-600">
                    Referenced type (external ID)
                    <input
                      list="new-attr-ref-list"
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-900 outline-none focus:border-blue-400"
                      placeholder="Search by external ID…"
                      value={newAttrRefId}
                      onChange={(e) => setNewAttrRefId(e.target.value)}
                    />
                    <datalist id="new-attr-ref-list">
                      {flattened.map((f) => <option key={f.objectType.externalId} value={f.objectType.externalId}>{f.objectType.name}</option>)}
                    </datalist>
                  </label>
                )}

                {newAttrType === 'status' && (
                  <label className="col-span-2 flex flex-col gap-0.5 text-[11px] text-slate-600">
                    Options (comma-separated)
                    <input
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-900 outline-none focus:border-blue-400"
                      placeholder="e.g. Active, Inactive, Retired"
                      value={newAttrTypeValues}
                      onChange={(e) => setNewAttrTypeValues(e.target.value)}
                    />
                  </label>
                )}

                <label className="flex flex-col gap-0.5 text-[11px] text-slate-600">
                  Min cardinality
                  <input
                    type="number" min={0}
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-[12px] outline-none focus:border-blue-400"
                    placeholder="0"
                    value={newAttrMinCard}
                    onChange={(e) => setNewAttrMinCard(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                </label>
                <label className="flex flex-col gap-0.5 text-[11px] text-slate-600">
                  Max cardinality
                  <input
                    type="number" min={0}
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-[12px] outline-none focus:border-blue-400"
                    placeholder="unlimited"
                    value={newAttrMaxCard}
                    onChange={(e) => setNewAttrMaxCard(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                </label>

                <label className="col-span-2 flex flex-col gap-0.5 text-[11px] text-slate-600">
                  Description
                  <textarea
                    rows={2}
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-900 outline-none focus:border-blue-400 resize-none"
                    placeholder="Optional description"
                    value={newAttrDescription}
                    onChange={(e) => setNewAttrDescription(e.target.value)}
                  />
                </label>

                <div className="col-span-2 flex gap-4">
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={newAttrLabel} onChange={(e) => setNewAttrLabel(e.target.checked)} />
                    Label field
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={newAttrUnique} onChange={(e) => setNewAttrUnique(e.target.checked)} />
                    Unique
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-1.5 border-t border-blue-100 pt-2">
                <button className="rounded border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-600 hover:bg-slate-50" onClick={resetAddForm}>Cancel</button>
                <button
                  className="rounded bg-blue-600 px-3 py-1 text-[11px] text-white hover:bg-blue-700 disabled:opacity-50"
                  disabled={!newAttrName.trim()}
                  onClick={addAttr}
                >
                  Add attribute
                </button>
              </div>
            </div>
          ) : (
            <button
              className="flex w-full items-center gap-2 rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-[12px] text-slate-400 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/20 transition-colors"
              onClick={() => setIsAddingAttr(true)}
            >
              <span>+</span>
              <span>Add attribute…</span>
            </button>
          )}
        </div>
      </div>

      {/* Move attributes panel */}
      {isMoveMode && (
        <MoveAttributesPanel
          sourceType={selected}
          flattened={flattened}
          onClose={() => setIsMoveMode(false)}
        />
      )}

      {/* Diagnostics strip */}
      {typeDiagnostics.length > 0 && (
        <DiagnosticsStrip
          diagnostics={typeDiagnostics}
          deferredDiagnostics={deferredDiagnostics}
          onDefer={onDeferDiagnostic}
          onUndefer={onUndeferDiagnostic}
        />
      )}
    </div>
  );
}

function DiagnosticsStrip({
  diagnostics,
  deferredDiagnostics,
  onDefer,
  onUndefer,
}: {
  diagnostics: Diagnostic[];
  deferredDiagnostics: Array<{ code: string; path: string }>;
  onDefer: (code: string, path: string) => void;
  onUndefer: (code: string, path: string) => void;
}) {
  const [cursor, setCursor] = useState(0);
  const diag = diagnostics[cursor];
  if (!diag) return null;

  const isDeferred = deferredDiagnostics.some((d) => d.code === diag.code && d.path === diag.path);
  const severityColors = diag.severity === 'error' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50';
  const icon = diag.severity === 'error' ? '✕' : '⚠';

  return (
    <div className="flex items-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2">
      <span className="flex-shrink-0 text-[11px] font-semibold text-slate-400">Diagnostics</span>
      <div className={`flex flex-1 items-center gap-1.5 rounded border px-2 py-1 text-[11px] ${severityColors}`}>
        <span>{icon}</span>
        <span className="flex-1">{diag.message}</span>
        <span className="font-mono text-[10px] text-slate-400">{diag.code}</span>
        {isDeferred && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600">Deferred</span>}
      </div>
      <button
        className="flex-shrink-0 rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50"
        onClick={() => isDeferred ? onUndefer(diag.code, diag.path) : onDefer(diag.code, diag.path)}
      >
        {isDeferred ? 'Un-defer' : 'Defer'}
      </button>
      {diagnostics.length > 1 && (
        <div className="flex items-center gap-1">
          <button className="text-[11px] text-slate-400 hover:text-slate-700 disabled:opacity-30" disabled={cursor === 0} onClick={() => setCursor((c) => c - 1)}>‹</button>
          <span className="text-[11px] text-slate-400">{cursor + 1}/{diagnostics.length}</span>
          <button className="text-[11px] text-slate-400 hover:text-slate-700 disabled:opacity-30" disabled={cursor === diagnostics.length - 1} onClick={() => setCursor((c) => c + 1)}>›</button>
        </div>
      )}
    </div>
  );
}

const ICON_MAP: [RegExp, string][] = [
  [/server|host|machine|compute/i, '🖥'],
  [/network|switch|router|device/i, '🌐'],
  [/software|app|application|service|deploy/i, '💿'],
  [/person|people|user|employee|staff/i, '👤'],
  [/location|building|site|office/i, '🏢'],
  [/database|db|data/i, '🗄'],
  [/cluster|container|pod|k8s|kubernetes/i, '⚙'],
];

function getTypeIcon(objectType: ObjectTypeDefinition): string {
  const key = objectType.iconKey ?? objectType.name ?? '';
  for (const [pattern, icon] of ICON_MAP) {
    if (pattern.test(key)) return icon;
  }
  return '📦';
}
