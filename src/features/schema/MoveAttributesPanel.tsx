'use client';

import { useEffect, useState } from 'react';
import type { FlattenedObjectType } from '@/domain/model/types';
import { deriveRename, moveAttributes } from '@/domain/transformers/moveAttributes';
import { useDocumentStore } from '@/stores/documentStore';

type Props = {
  sourceType: FlattenedObjectType;
  flattened: FlattenedObjectType[];
  onClose: () => void;
};

export function MoveAttributesPanel({ sourceType, flattened, onClose }: Props) {
  const updateDocument = useDocumentStore((s) => s.updateDocument);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [destExternalId, setDestExternalId] = useState('');
  // Map of original externalId → user-editable new externalId
  const [renameMap, setRenameMap] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string | null>(null);

  const localAttrs = sourceType.objectType.attributes ?? [];
  const otherTypes = flattened.filter(
    (item) => item.objectType.externalId !== sourceType.objectType.externalId,
  );

  // Recompute rename suggestions whenever selection or destination changes
  useEffect(() => {
    if (!destExternalId) return;
    setRenameMap((prev) => {
      const next = { ...prev };
      for (const id of selectedIds) {
        if (next[id] === undefined) {
          // Only seed if not already set by the user
          next[id] = deriveRename(id, sourceType.objectType.externalId, destExternalId) ?? id;
        }
      }
      // Seed newly-added attributes
      return next;
    });
  }, [selectedIds, destExternalId, sourceType.objectType.externalId]);

  // When destination changes, re-seed all selected attrs with fresh heuristic suggestions
  const handleDestChange = (newDest: string) => {
    setDestExternalId(newDest);
    if (!newDest) return;
    setRenameMap((prev) => {
      const next = { ...prev };
      for (const id of selectedIds) {
        next[id] = deriveRename(id, sourceType.objectType.externalId, newDest) ?? id;
      }
      return next;
    });
  };

  const toggleAttr = (externalId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(externalId)) {
        next.delete(externalId);
      } else {
        next.add(externalId);
        // Seed rename suggestion on first selection
        if (destExternalId) {
          setRenameMap((r) => ({
            ...r,
            [externalId]: r[externalId] ?? deriveRename(externalId, sourceType.objectType.externalId, destExternalId) ?? externalId,
          }));
        }
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === localAttrs.length) {
      setSelectedIds(new Set());
    } else {
      const allIds = new Set(localAttrs.map((a) => a.externalId));
      setSelectedIds(allIds);
      if (destExternalId) {
        setRenameMap((prev) => {
          const next = { ...prev };
          for (const id of allIds) {
            next[id] = prev[id] ?? deriveRename(id, sourceType.objectType.externalId, destExternalId) ?? id;
          }
          return next;
        });
      }
    }
  };

  const handleMove = () => {
    if (!destExternalId || selectedIds.size === 0) return;

    // Build explicit renames: only include entries that differ from original
    const explicitRenames: Record<string, string> = {};
    for (const id of selectedIds) {
      const newId = renameMap[id] ?? id;
      if (newId && newId !== id) explicitRenames[id] = newId;
    }

    let summary = '';
    updateDocument((doc) => {
      const r = moveAttributes(
        doc,
        sourceType.objectType.externalId,
        [...selectedIds],
        destExternalId,
        explicitRenames,
      );
      const destName = otherTypes.find((t) => t.objectType.externalId === destExternalId)?.objectType.name ?? destExternalId;
      summary = `Moved ${r.movedCount} attribute${r.movedCount !== 1 ? 's' : ''} to "${destName}".`;
      const renameEntries = Object.entries(r.renames);
      if (renameEntries.length > 0) {
        summary += ` Renamed: ${renameEntries.map(([old, next]) => `${old} → ${next}`).join(', ')}.`;
      }
      if (r.skippedDuplicates.length > 0) {
        summary += ` ${r.skippedDuplicates.length} skipped (already exist on destination).`;
      }
      if (r.mappingSourceRemoved > 0 || r.mappingDestAdded > 0) {
        summary += ` Mapping updated: −${r.mappingSourceRemoved} from source, +${r.mappingDestAdded} to destination.`;
      }
      return r.document;
    });

    setResult(summary);
    setSelectedIds(new Set());
    setDestExternalId('');
    setRenameMap({});
  };

  const showRenames = selectedIds.size > 0 && Boolean(destExternalId);

  return (
    <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-blue-800">Move attributes</div>
        <button className="text-xs text-slate-500 hover:text-slate-700" onClick={onClose}>✕</button>
      </div>

      {result && (
        <div className="rounded-md border border-green-200 bg-green-50 px-2 py-1.5 text-xs text-green-800">
          {result}
        </div>
      )}

      {localAttrs.length === 0 ? (
        <div className="text-xs text-slate-500">No local attributes to move.</div>
      ) : (
        <>
          {/* Step 1: select attributes */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600 font-medium">Select attributes</span>
              <button className="text-xs text-blue-700 hover:underline" onClick={toggleAll}>
                {selectedIds.size === localAttrs.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div className="max-h-40 overflow-auto space-y-1 rounded-md border border-blue-100 bg-white p-2">
              {localAttrs.map((attr) => (
                <label
                  key={attr.externalId}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(attr.externalId)}
                    onChange={() => toggleAttr(attr.externalId)}
                    className="accent-blue-700"
                  />
                  <span className="text-xs text-slate-800 font-medium">{attr.name}</span>
                  <span className="text-xs text-slate-400">{attr.type}</span>
                  <span className="ml-auto text-[11px] text-slate-400">{attr.externalId}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Step 2: pick destination */}
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            <span className="font-medium">Destination object type</span>
            <select
              className="rounded-md border border-blue-200 bg-white px-2 py-1 text-xs text-slate-900"
              value={destExternalId}
              onChange={(e) => handleDestChange(e.target.value)}
            >
              <option value="">— pick a destination —</option>
              {otherTypes.map((item) => (
                <option key={item.objectType.externalId} value={item.objectType.externalId}>
                  {item.objectType.name} ({item.objectType.externalId})
                </option>
              ))}
            </select>
          </label>

          {/* Step 3: rename preview — always shown when attrs + dest selected */}
          {showRenames && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-slate-600">
                Rename IDs
                <span className="ml-1 font-normal text-slate-400">(edit to override)</span>
              </div>
              <div className="space-y-1 rounded-md border border-blue-100 bg-white p-2">
                {[...selectedIds].map((oldId) => (
                  <div key={oldId} className="flex items-center gap-1.5">
                    <span className="w-0 flex-1 truncate text-[11px] text-slate-500" title={oldId}>{oldId}</span>
                    <span className="shrink-0 text-[11px] text-slate-400">→</span>
                    <input
                      className="w-0 flex-1 rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-900 font-mono"
                      value={renameMap[oldId] ?? oldId}
                      onChange={(e) => setRenameMap((prev) => ({ ...prev, [oldId]: e.target.value }))}
                      spellCheck={false}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              className="rounded-md bg-blue-700 px-3 py-1 text-xs text-white disabled:cursor-not-allowed disabled:bg-blue-300"
              disabled={selectedIds.size === 0 || !destExternalId}
              onClick={handleMove}
            >
              Move {selectedIds.size > 0 ? `${selectedIds.size} attribute${selectedIds.size !== 1 ? 's' : ''}` : ''}
            </button>
            <button
              className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700"
              onClick={onClose}
            >
              Done
            </button>
          </div>
        </>
      )}
    </div>
  );
}
