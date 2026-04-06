'use client';

import { useState } from 'react';
import type {
  AttributeMappingDefinition,
  FlattenedObjectType,
  ObjectTypeMappingDefinition,
} from '@/domain/model/types';

interface DeadIndex {
  deadObjectTypeExternalIds: Set<string>;
  deadAttributeKeys: Set<string>;
}

interface Props {
  mapping: ObjectTypeMappingDefinition;
  objectType: FlattenedObjectType | undefined;
  schemaAttributeOptions: Array<{ externalId: string; name: string; type: string }>;
  deadIndex: DeadIndex;
  focusedPath: string | undefined;
  mappingIndex: number;
  onUpdate: (updater: (mapping: ObjectTypeMappingDefinition) => ObjectTypeMappingDefinition) => void;
  onRemove: () => void;
  onOpenSchema: () => void;
  onOpenGenerator: () => void;
}

function updateAtIndex(
  list: AttributeMappingDefinition[],
  index: number,
  patch: Partial<AttributeMappingDefinition>,
): AttributeMappingDefinition[] {
  return list.map((item, i) => (i === index ? { ...item, ...patch } : item));
}

function duplicateAtIndex(list: AttributeMappingDefinition[], index: number): AttributeMappingDefinition[] {
  const src = list[index];
  if (!src) return list;
  const dup = { ...src, attributeName: src.attributeName ? `${src.attributeName} Copy` : src.attributeName, externalIdPart: false };
  return [...list.slice(0, index + 1), dup, ...list.slice(index + 1)];
}

export function MappingDetailPanel({
  mapping,
  objectType,
  schemaAttributeOptions,
  deadIndex,
  focusedPath,
  mappingIndex,
  onUpdate,
  onRemove,
  onOpenSchema,
  onOpenGenerator,
}: Props) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [unmappedOpen, setUnmappedOpen] = useState(true);

  const hasExternalIdPart = mapping.attributesMapping.some((a) => a.externalIdPart);
  const isDead = deadIndex.deadObjectTypeExternalIds.has(mapping.objectTypeExternalId);

  const mappedExternalIds = new Set(mapping.attributesMapping.map((a) => a.attributeExternalId));
  const unmappedSchemaAttrs = schemaAttributeOptions.filter((a) => !mappedExternalIds.has(a.externalId));

  const addAttrMapping = () => {
    onUpdate((m) => ({
      ...m,
      attributesMapping: [
        ...m.attributesMapping,
        {
          attributeExternalId: schemaAttributeOptions[0]?.externalId ?? `attr-${m.attributesMapping.length + 1}`,
          attributeName: schemaAttributeOptions[0]?.name ?? 'New Mapping',
          attributeLocators: [],
        },
      ],
    }));
  };

  const isFocused = (suffix: string) =>
    focusedPath?.startsWith(`/mapping/objectTypeMappings/${mappingIndex}${suffix}`) ?? false;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
        <span className="text-blue-600">Mapping</span>
        <span className="text-slate-300">›</span>
        <span className="font-medium text-slate-700">{mapping.objectTypeName ?? mapping.objectTypeExternalId}</span>
        {isDead && (
          <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">Dead</span>
        )}
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-xl">
          🗺
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold text-slate-800 truncate">
            {mapping.objectTypeName ?? mapping.objectTypeExternalId}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-slate-400">
            {mapping.objectTypeExternalId}
            {objectType ? ` · ${objectType.objectType.name}` : ' · type not found'}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <button className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50" onClick={onOpenSchema}>
            → Schema
          </button>
          <button className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50" onClick={onOpenGenerator}>
            Generator
          </button>
          <button className="flex h-7 w-7 items-center justify-center rounded border border-red-100 bg-white text-[12px] text-red-500 hover:bg-red-50" title="Remove mapping" onClick={onRemove}>🗑</button>
        </div>
      </div>

      {/* Mapping fields */}
      <div className="flex-1 overflow-y-auto">
        {/* Core fields */}
        <div className="border-b border-slate-200 px-4 py-3 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Mapping Config</div>
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-2 flex flex-col gap-0.5 text-[11px] text-slate-600">
              Selector
              <input
                className={`rounded border px-2 py-1 text-[12px] text-slate-900 outline-none focus:border-blue-400 ${isFocused('/selector') ? 'border-amber-400 bg-amber-50' : 'border-slate-200'}`}
                value={mapping.selector}
                placeholder="e.g. objectType = &quot;CI&quot;"
                onChange={(e) => onUpdate((m) => ({ ...m, selector: e.target.value }))}
              />
              {!mapping.selector.trim() && (
                <span className="text-[11px] text-amber-600">Selector should not be empty for reliable imports</span>
              )}
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] text-slate-600">
              Object type name
              <input
                className={`rounded border px-2 py-1 text-[12px] text-slate-900 outline-none focus:border-blue-400 ${isFocused('/objectTypeName') ? 'border-amber-400 bg-amber-50' : 'border-slate-200'}`}
                value={mapping.objectTypeName ?? ''}
                placeholder="Display name"
                onChange={(e) => onUpdate((m) => ({ ...m, objectTypeName: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] text-slate-600">
              Unknown values
              <select
                className="rounded border border-slate-200 px-2 py-1 text-[12px] text-slate-900 outline-none focus:border-blue-400"
                value={mapping.unknownValues ?? 'ADD'}
                onChange={(e) => onUpdate((m) => ({ ...m, unknownValues: e.target.value }))}
              >
                <option value="ADD">ADD</option>
                <option value="IGNORE">IGNORE</option>
              </select>
            </label>
            <label className="col-span-2 flex flex-col gap-0.5 text-[11px] text-slate-600">
              Description
              <textarea
                className={`rounded border px-2 py-1 text-[12px] text-slate-900 outline-none focus:border-blue-400 ${isFocused('/description') ? 'border-amber-400 bg-amber-50' : 'border-slate-200'}`}
                value={mapping.description ?? ''}
                rows={2}
                placeholder="Optional description"
                onChange={(e) => onUpdate((m) => ({ ...m, description: e.target.value }))}
              />
            </label>
          </div>
          {!hasExternalIdPart && (
            <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">
              Mark one attribute mapping as <strong>externalIdPart</strong> to avoid duplicate imports
            </div>
          )}
        </div>

        {/* Attribute mappings */}
        <div>
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Attribute Mappings</span>
            <span className="text-[11px] text-slate-400">{mapping.attributesMapping.length} total</span>
            <button className="ml-auto rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50" onClick={addAttrMapping}>+ Add</button>
          </div>

          <div className="px-4 py-2 space-y-0.5">
            {mapping.attributesMapping.length === 0 && (
              <div className="py-4 text-center text-[12px] text-slate-400">No attribute mappings — add one above</div>
            )}

            {mapping.attributesMapping.map((attrMap, index) => {
              const isActive = activeIndex === index;
              const isExpanded = expandedIndex === index;
              const isDead = deadIndex.deadAttributeKeys.has(`${mapping.objectTypeExternalId}::${attrMap.attributeExternalId}`);
              const isFocusedAttr = focusedPath?.startsWith(`/mapping/objectTypeMappings/${mappingIndex}/attributesMapping/${index}`) ?? false;
              const schemaAttr = schemaAttributeOptions.find((a) => a.externalId === attrMap.attributeExternalId);
              const needsIql = schemaAttr?.type === 'referenced_object' && !attrMap.objectMappingIQL;

              return (
                <div key={`${attrMap.attributeExternalId}-${index}`}>
                  <div
                    className={`group flex items-center gap-2 rounded-md border px-2 py-1.5 cursor-pointer transition-colors ${
                      isFocusedAttr ? 'border-amber-300 bg-amber-50 ring-1 ring-amber-200' :
                      isDead ? 'border-red-200 bg-red-50' :
                      isActive ? 'border-blue-300 bg-blue-50/30' :
                      'border-transparent hover:border-slate-200 hover:bg-slate-50'
                    }`}
                    onClick={() => {
                      if (isExpanded) { setExpandedIndex(null); setActiveIndex(null); }
                      else { setExpandedIndex(index); setActiveIndex(index); }
                    }}
                  >
                    <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${attrMap.externalIdPart ? 'bg-blue-500' : 'bg-slate-300'}`} title={attrMap.externalIdPart ? 'externalIdPart' : 'not externalIdPart'} />
                    <div className="flex flex-1 items-center gap-2 min-w-0">
                      <span className="text-[13px] font-medium text-slate-800 min-w-[110px] truncate">
                        {attrMap.attributeName ?? attrMap.attributeExternalId}
                      </span>
                      {isDead && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">Dead</span>}
                      {attrMap.attributeLocators && attrMap.attributeLocators.length > 0 && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{attrMap.attributeLocators.length} locator{attrMap.attributeLocators.length > 1 ? 's' : ''}</span>
                      )}
                      {attrMap.objectMappingIQL && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-600">IQL</span>
                      )}
                      {needsIql && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-600">needs IQL</span>
                      )}
                    </div>
                    <div className={`flex items-center gap-1 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      <button
                        className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-[11px] text-slate-600 hover:bg-slate-50"
                        title="Edit"
                        onClick={(e) => { e.stopPropagation(); setExpandedIndex(isExpanded ? null : index); setActiveIndex(index); }}
                      >✎</button>
                      <button
                        className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-[11px] text-slate-600 hover:bg-slate-50"
                        title="Duplicate"
                        onClick={(e) => { e.stopPropagation(); onUpdate((m) => ({ ...m, attributesMapping: duplicateAtIndex(m.attributesMapping, index) })); }}
                      >⧉</button>
                      <button
                        className="flex h-6 w-6 items-center justify-center rounded border border-red-100 bg-white text-[11px] text-red-500 hover:bg-red-50"
                        title="Remove"
                        onClick={(e) => { e.stopPropagation(); onUpdate((m) => ({ ...m, attributesMapping: m.attributesMapping.filter((_, i) => i !== index) })); if (activeIndex === index) setActiveIndex(null); if (expandedIndex === index) setExpandedIndex(null); }}
                      >✕</button>
                    </div>
                  </div>

                  {/* Inline expanded editor */}
                  {isExpanded && (
                    <div className="mx-2 mb-1 rounded-md border border-blue-200 bg-slate-50 px-3 py-2.5 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <label className="col-span-2 flex flex-col gap-0.5 text-[11px] text-slate-600">
                          Attribute (schema)
                          <select
                            className="rounded border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-900 outline-none focus:border-blue-400"
                            value={attrMap.attributeExternalId}
                            onChange={(e) => {
                              const attr = schemaAttributeOptions.find((a) => a.externalId === e.target.value);
                              onUpdate((m) => ({ ...m, attributesMapping: updateAtIndex(m.attributesMapping, index, { attributeExternalId: e.target.value, attributeName: attr?.name ?? attrMap.attributeName }) }));
                            }}
                          >
                            {!schemaAttributeOptions.some((a) => a.externalId === attrMap.attributeExternalId) && (
                              <option value={attrMap.attributeExternalId}>{attrMap.attributeExternalId} (missing)</option>
                            )}
                            {schemaAttributeOptions.map((a) => (
                              <option key={a.externalId} value={a.externalId}>{a.name} ({a.externalId})</option>
                            ))}
                          </select>
                        </label>
                        <label className="col-span-2 flex flex-col gap-0.5 text-[11px] text-slate-600">
                          Attribute name (override)
                          <input
                            className="rounded border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-900 outline-none focus:border-blue-400"
                            value={attrMap.attributeName ?? ''}
                            placeholder="Leave blank to use schema name"
                            onChange={(e) => onUpdate((m) => ({ ...m, attributesMapping: updateAtIndex(m.attributesMapping, index, { attributeName: e.target.value }) }))}
                          />
                        </label>
                        <label className="col-span-2 flex flex-col gap-0.5 text-[11px] text-slate-600">
                          Locators (comma-separated)
                          <input
                            className="rounded border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-900 outline-none focus:border-blue-400"
                            value={(attrMap.attributeLocators ?? []).join(', ')}
                            placeholder="e.g. $.hostname, $.ip"
                            onChange={(e) => onUpdate((m) => ({ ...m, attributesMapping: updateAtIndex(m.attributesMapping, index, { attributeLocators: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) }) }))}
                          />
                        </label>
                        <label className="col-span-2 flex flex-col gap-0.5 text-[11px] text-slate-600">
                          objectMappingIQL
                          <input
                            className={`rounded border bg-white px-2 py-1 text-[12px] text-slate-900 outline-none focus:border-blue-400 ${needsIql ? 'border-amber-300' : 'border-slate-200'}`}
                            value={attrMap.objectMappingIQL ?? ''}
                            placeholder="IQL expression for referenced_object"
                            onChange={(e) => onUpdate((m) => ({ ...m, attributesMapping: updateAtIndex(m.attributesMapping, index, { objectMappingIQL: e.target.value || undefined }) }))}
                          />
                          {needsIql && <span className="text-[11px] text-amber-600">referenced_object attributes should define objectMappingIQL</span>}
                        </label>
                        <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(attrMap.externalIdPart)}
                            onChange={(e) => onUpdate((m) => ({ ...m, attributesMapping: updateAtIndex(m.attributesMapping, index, { externalIdPart: e.target.checked }) }))}
                          />
                          externalIdPart
                        </label>
                      </div>
                      <div className="flex justify-end">
                        <button className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50" onClick={() => setExpandedIndex(null)}>Done</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Unmapped schema attributes */}
        {unmappedSchemaAttrs.length > 0 && (
          <div className="border-t border-slate-200">
            <button
              className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-slate-50 transition-colors"
              onClick={() => setUnmappedOpen((v) => !v)}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">
                Unmapped attributes
              </span>
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                {unmappedSchemaAttrs.length}
              </span>
              <span className="ml-auto text-[11px] text-slate-400">{unmappedOpen ? '▲' : '▼'}</span>
            </button>
            {unmappedOpen && (
              <div className="px-4 pb-3 space-y-0.5">
                {unmappedSchemaAttrs.map((attr) => (
                  <div key={attr.externalId} className="flex items-center gap-2 rounded-md border border-amber-100 bg-amber-50 px-2 py-1.5">
                    <div className="flex-1 min-w-0">
                      <span className="text-[12px] font-medium text-slate-700">{attr.name}</span>
                      <span className="ml-2 font-mono text-[10px] text-slate-400">{attr.externalId}</span>
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{attr.type}</span>
                    </div>
                    <button
                      className="flex-shrink-0 rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
                      title="Add mapping for this attribute"
                      onClick={() => onUpdate((m) => ({
                        ...m,
                        attributesMapping: [
                          ...m.attributesMapping,
                          { attributeExternalId: attr.externalId, attributeName: attr.name, attributeLocators: [] },
                        ],
                      }))}
                    >
                      + Add
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
