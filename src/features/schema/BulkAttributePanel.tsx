'use client';

import { useState } from 'react';
import type { FlattenedObjectType, ObjectAttributeDefinition } from '@/domain/model/types';
import { bulkAddAttribute } from '@/domain/transformers/bulkAddAttribute';
import { useDocumentStore } from '@/stores/documentStore';

const ATTRIBUTE_TYPES = [
  'text',
  'textarea',
  'integer',
  'double',
  'boolean',
  'date',
  'time',
  'date_time',
  'email',
  'url',
  'status',
  'referenced_object',
  'select',
  'ipaddress',
] as const;

interface BulkAttributePanelProps {
  flattened: FlattenedObjectType[];
}

export function BulkAttributePanel({ flattened }: BulkAttributePanelProps) {
  const updateDocument = useDocumentStore((state) => state.updateDocument);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [attrName, setAttrName] = useState('');
  const [attrExternalId, setAttrExternalId] = useState('');
  const [attrType, setAttrType] = useState<string>('text');
  const [refObjectTypeExternalId, setRefObjectTypeExternalId] = useState('');
  const [skippedNotice, setSkippedNotice] = useState<string[] | null>(null);

  const allIds = flattened.map((item) => item.objectType.externalId);

  const toggleAll = (select: boolean) => {
    setSelectedIds(select ? new Set(allIds) : new Set());
  };

  const toggleOne = (externalId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(externalId)) {
        next.delete(externalId);
      } else {
        next.add(externalId);
      }
      return next;
    });
  };

  const handleSubmit = () => {
    if (!attrName.trim() || !attrExternalId.trim() || selectedIds.size === 0) {
      return;
    }

    const attribute: ObjectAttributeDefinition = {
      externalId: attrExternalId.trim(),
      name: attrName.trim(),
      type: attrType,
      ...(attrType === 'referenced_object' && refObjectTypeExternalId
        ? {
            referenceObjectTypeExternalId: refObjectTypeExternalId,
            referenceObjectTypeName: flattened.find(
              (item) => item.objectType.externalId === refObjectTypeExternalId,
            )?.objectType.name ?? refObjectTypeExternalId,
          }
        : {}),
    };

    let skipped: string[] = [];

    updateDocument((doc) => {
      const result = bulkAddAttribute(doc, Array.from(selectedIds), attribute);
      skipped = result.skippedExternalIds;
      return result.document;
    });

    setSkippedNotice(skipped.length > 0 ? skipped : null);
    setAttrName('');
    setAttrExternalId('');
    setAttrType('text');
    setRefObjectTypeExternalId('');
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
          <span className="text-xs font-semibold text-slate-700">
            Object types ({selectedIds.size} selected)
          </span>
          <div className="flex gap-2 text-xs">
            <button
              className="rounded border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50"
              onClick={() => toggleAll(true)}
            >
              Select all
            </button>
            <button
              className="rounded border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50"
              onClick={() => toggleAll(false)}
            >
              Deselect all
            </button>
          </div>
        </div>
        <div className="max-h-64 overflow-auto">
          {flattened.length === 0 ? (
            <div className="px-3 py-4 text-xs text-slate-500">No object types in schema.</div>
          ) : (
            flattened.map((item) => (
              <label
                key={item.objectType.externalId}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-50"
                style={{ paddingLeft: `${12 + item.depth * 16}px` }}
              >
                <input
                  type="checkbox"
                  className="shrink-0"
                  checked={selectedIds.has(item.objectType.externalId)}
                  onChange={() => toggleOne(item.objectType.externalId)}
                />
                <span className="font-medium text-slate-800">{item.objectType.name}</span>
                <span className="text-slate-400">{item.objectType.externalId}</span>
              </label>
            ))
          )}
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-3">
        <div className="text-xs font-semibold text-slate-700">New attribute</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Name
            <input
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
              placeholder="Attribute name"
              value={attrName}
              onChange={(e) => setAttrName(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            External ID
            <input
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
              placeholder="attribute-external-id"
              value={attrExternalId}
              onChange={(e) => setAttrExternalId(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600 sm:col-span-2">
            Type
            <select
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
              value={attrType}
              onChange={(e) => { setAttrType(e.target.value); setRefObjectTypeExternalId(''); }}
            >
              {ATTRIBUTE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          {attrType === 'referenced_object' && (
            <label className="flex flex-col gap-1 text-xs text-slate-600 sm:col-span-2">
              Referenced object type
              <select
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
                value={refObjectTypeExternalId}
                onChange={(e) => setRefObjectTypeExternalId(e.target.value)}
              >
                <option value="">— select target object type —</option>
                {flattened.map((item) => (
                  <option key={item.objectType.externalId} value={item.objectType.externalId}>
                    {item.objectType.name} ({item.objectType.externalId})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {skippedNotice !== null && skippedNotice.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Skipped {skippedNotice.length} {skippedNotice.length === 1 ? 'type' : 'types'} that already had this attribute:{' '}
            <span className="font-mono">{skippedNotice.join(', ')}</span>
          </div>
        )}

        <button
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          disabled={
            !attrName.trim() ||
            !attrExternalId.trim() ||
            selectedIds.size === 0 ||
            (attrType === 'referenced_object' && !refObjectTypeExternalId)
          }
          onClick={handleSubmit}
        >
          Add to selected ({selectedIds.size})
        </button>
      </div>
    </div>
  );
}
