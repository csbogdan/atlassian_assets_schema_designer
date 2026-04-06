'use client';

import { useMemo, useState } from 'react';
import { Panel } from '@/components/Panel';
import { buildIndexes, flattenObjectTypes } from '@/domain/selectors/indexes';
import { cloneMapping } from '@/domain/transformers/cloneMapping';
import { generateObjectTypeMapping } from '@/domain/transformers/generateObjectTypeMapping';
import { useDocumentStore } from '@/stores/documentStore';

type Step = 'select' | 'configure';

export function MappingGenerator() {
  const document = useDocumentStore((state) => state.document);
  const updateDocument = useDocumentStore((state) => state.updateDocument);
  const setActiveView = useDocumentStore((state) => state.setActiveView);

  const flattened = useMemo(
    () => (document ? flattenObjectTypes(document.schema.objectSchema.objectTypes) : []),
    [document],
  );
  const indexes = useMemo(() => (document ? buildIndexes(document) : null), [document]);
  const existingMappings = document?.mapping.objectTypeMappings ?? [];
  const mappedIds = useMemo(
    () => new Set(existingMappings.map((m) => m.objectTypeExternalId)),
    [existingMappings],
  );

  const [step, setStep] = useState<Step>('select');
  const [selectedId, setSelectedId] = useState('');
  const [selectorInput, setSelectorInput] = useState('');
  const [unknownValues, setUnknownValues] = useState<'ADD' | 'IGNORE'>('ADD');
  const [templateStrategy, setTemplateStrategy] = useState<'generate' | 'clone'>('generate');
  const [cloneSourceId, setCloneSourceId] = useState(existingMappings[0]?.objectTypeExternalId ?? '');
  const [batchAdded, setBatchAdded] = useState<string[]>([]);

  const selectedItem = flattened.find((item) => item.objectType.externalId === selectedId);
  const alreadyMapped = mappedIds.has(selectedId);

  const cloneSource = existingMappings.find((m) => m.objectTypeExternalId === cloneSourceId);

  const preview = useMemo(() => {
    if (!selectedItem) return undefined;
    if (templateStrategy === 'clone' && cloneSource) {
      return cloneMapping(cloneSource, selectedItem, selectorInput || undefined, indexes ?? undefined);
    }
    return generateObjectTypeMapping(selectedItem, selectorInput || undefined, indexes ?? undefined);
  }, [selectedItem, templateStrategy, cloneSource, selectorInput, indexes]);

  const unmappedItems = flattened.filter((item) => !mappedIds.has(item.objectType.externalId));

  if (!document) {
    return <Panel>Load a document to generate mapping stubs.</Panel>;
  }

  if (flattened.length === 0) {
    return (
      <Panel>
        <h2 className="mb-3 text-lg font-semibold">Mapping Generator</h2>
        <p className="mb-3 text-sm text-slate-500">No object types available.</p>
        <div className="flex flex-wrap gap-2">
          <button className="rounded-md bg-slate-900 px-3 py-2 text-xs text-white" onClick={() => setActiveView('schema')}>
            Open Schema Explorer
          </button>
          <button className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs" onClick={() => setActiveView('raw-json')}>
            Open Raw JSON
          </button>
        </div>
      </Panel>
    );
  }

  const selectAndConfigure = (externalId: string) => {
    const item = flattened.find((f) => f.objectType.externalId === externalId);
    if (!item || mappedIds.has(externalId)) return;
    setSelectedId(externalId);
    setSelectorInput(item.objectType.name.toLowerCase().replace(/\s+/g, '-'));
    setTemplateStrategy('generate');
    setStep('configure');
  };

  const addMapping = () => {
    if (!preview || alreadyMapped) return;
    updateDocument((current) => ({
      ...current,
      mapping: {
        ...current.mapping,
        objectTypeMappings: [...current.mapping.objectTypeMappings, { ...preview, unknownValues }],
      },
    }));
    setStep('select');
    setSelectedId('');
  };

  const generateAllUnmapped = () => {
    if (unmappedItems.length === 0) return;
    const newMappings = unmappedItems.map((item) =>
      generateObjectTypeMapping(item, undefined, indexes ?? undefined),
    );
    const added = newMappings.map((m) => m.objectTypeExternalId);
    updateDocument((current) => ({
      ...current,
      mapping: {
        ...current.mapping,
        objectTypeMappings: [...current.mapping.objectTypeMappings, ...newMappings],
      },
    }));
    setBatchAdded(added);
    setTimeout(() => setBatchAdded([]), 3000);
  };

  if (step === 'select') {
    return (
      <Panel>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Mapping Generator</h2>
          {unmappedItems.length > 0 && (
            <button
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              onClick={generateAllUnmapped}
            >
              Generate all unmapped ({unmappedItems.length})
            </button>
          )}
        </div>

        {batchAdded.length > 0 && (
          <div className="mb-3 rounded-md bg-green-50 px-3 py-2 text-xs text-green-700">
            Added {batchAdded.length} mapping{batchAdded.length !== 1 ? 's' : ''}. Open Mapping Explorer to review.
          </div>
        )}

        <p className="mb-3 text-xs text-slate-500">
          Select an unmapped object type to configure its mapping.
        </p>

        <div className="space-y-1">
          {flattened.map((item) => {
            const mapped = mappedIds.has(item.objectType.externalId);
            return (
              <button
                key={item.objectType.externalId}
                disabled={mapped}
                onClick={() => selectAndConfigure(item.objectType.externalId)}
                className={[
                  'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors',
                  mapped
                    ? 'cursor-default bg-slate-50 text-slate-400'
                    : 'bg-white hover:bg-blue-50 hover:text-blue-700 border border-slate-200',
                  item.depth > 0 ? `pl-${Math.min(item.depth * 4 + 3, 12)}` : '',
                ].join(' ')}
              >
                <span className="flex items-center gap-2">
                  {item.depth > 0 && (
                    <span className="text-slate-300" style={{ paddingLeft: `${item.depth * 12}px` }}>↳</span>
                  )}
                  <span className="font-medium">{item.objectType.name}</span>
                  <span className="text-xs text-slate-400">{item.objectType.externalId}</span>
                </span>
                {mapped && (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-500">mapped</span>
                )}
              </button>
            );
          })}
        </div>

        {unmappedItems.length === 0 && (
          <p className="mt-4 text-xs text-slate-500">
            All object types have mappings.{' '}
            <button className="underline" onClick={() => setActiveView('mapping')}>Open Mapping Explorer</button>
          </p>
        )}
      </Panel>
    );
  }

  // Step: configure
  return (
    <Panel>
      <div className="mb-4 flex items-center gap-3">
        <button
          className="text-xs text-slate-500 hover:text-slate-800"
          onClick={() => setStep('select')}
        >
          ← Back
        </button>
        <h2 className="text-lg font-semibold">
          Configure: {selectedItem?.objectType.name}
        </h2>
      </div>

      <div className="space-y-4">
        {/* Selector */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-600" htmlFor="mg-selector">
            Selector
          </label>
          <input
            id="mg-selector"
            className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            value={selectorInput}
            onChange={(e) => setSelectorInput(e.target.value)}
            placeholder="e.g. my-object-type"
          />
        </div>

        {/* unknownValues + template in a row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-600" htmlFor="mg-unknown">
              Unknown values
            </label>
            <select
              id="mg-unknown"
              className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              value={unknownValues}
              onChange={(e) => setUnknownValues(e.target.value as 'ADD' | 'IGNORE')}
            >
              <option value="ADD">ADD</option>
              <option value="IGNORE">IGNORE</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-600" htmlFor="mg-template">
              Template
            </label>
            <select
              id="mg-template"
              className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              value={templateStrategy}
              onChange={(e) => setTemplateStrategy(e.target.value as 'generate' | 'clone')}
            >
              <option value="generate">Generate from schema</option>
              {existingMappings.length > 0 && <option value="clone">Clone from existing</option>}
            </select>
          </div>
        </div>

        {/* Clone source picker */}
        {templateStrategy === 'clone' && existingMappings.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-600" htmlFor="mg-clone-source">
              Clone from mapping
            </label>
            <select
              id="mg-clone-source"
              className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              value={cloneSourceId}
              onChange={(e) => setCloneSourceId(e.target.value)}
            >
              {existingMappings.map((m) => (
                <option key={m.objectTypeExternalId} value={m.objectTypeExternalId}>
                  {m.objectTypeName ?? m.objectTypeExternalId}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-400">
              Attribute locators/IQL/valueMappings from this source will be carried over where attribute names match.
            </p>
          </div>
        )}

        {/* Add button */}
        <div className="flex items-center justify-between">
          {alreadyMapped ? (
            <span className="text-xs text-amber-600">A mapping already exists for this object type.</span>
          ) : (
            <span className="text-xs text-slate-500">
              {(preview?.attributesMapping.length ?? 0)} attribute mapping{preview?.attributesMapping.length !== 1 ? 's' : ''} will be generated.
            </span>
          )}
          <button
            className="rounded-md bg-slate-900 px-4 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            onClick={addMapping}
            disabled={alreadyMapped || !preview}
          >
            Add mapping
          </button>
        </div>

        {/* Preview */}
        {preview && (
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-500">Preview</p>
            <pre className="max-h-[380px] overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-50">
              {JSON.stringify(preview, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </Panel>
  );
}
