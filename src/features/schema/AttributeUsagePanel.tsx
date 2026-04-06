'use client';

import { useMemo } from 'react';
import { buildAttributeUsageReport } from '@/domain/selectors/attributeUsage';
import { useDocumentStore } from '@/stores/documentStore';

interface AttributeUsagePanelProps {
  attributeExternalId: string;
  onClose: () => void;
}

export function AttributeUsagePanel({ attributeExternalId, onClose }: AttributeUsagePanelProps) {
  const document = useDocumentStore((state) => state.document);
  const setSelectedObjectTypeExternalId = useDocumentStore(
    (state) => state.setSelectedObjectTypeExternalId,
  );

  const report = useMemo(() => {
    if (!document) return null;
    return buildAttributeUsageReport(document, attributeExternalId);
  }, [document, attributeExternalId]);

  return (
    <div className="absolute inset-0 z-20 overflow-auto rounded-md border border-slate-300 bg-white shadow-lg">
      <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2">
        <div>
          <div className="text-xs font-semibold text-slate-800">Attribute usage</div>
          <div className="font-mono text-[11px] text-slate-500">{attributeExternalId}</div>
        </div>
        <button
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
          onClick={onClose}
        >
          Close
        </button>
      </div>

      {!document ? (
        <div className="px-3 py-6 text-xs text-slate-500">No document loaded.</div>
      ) : !report ? (
        <div className="px-3 py-6 text-xs text-slate-500">Loading...</div>
      ) : (
        <div className="space-y-4 p-3">
          {/* Object types section */}
          <div>
            <div className="mb-2 text-xs font-semibold text-slate-700">
              Used by {report.objectTypes.length} object{' '}
              {report.objectTypes.length === 1 ? 'type' : 'types'}
            </div>
            {report.objectTypes.length === 0 ? (
              <div className="text-xs text-slate-400">Not used by any object type.</div>
            ) : (
              <div className="space-y-1">
                {report.objectTypes.map((entry) => (
                  <button
                    key={entry.externalId}
                    className="flex w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-left text-xs hover:bg-slate-100"
                    onClick={() => {
                      setSelectedObjectTypeExternalId(entry.externalId);
                      onClose();
                    }}
                  >
                    <span className="font-medium text-slate-800">{entry.name}</span>
                    <span className="text-slate-400">{entry.externalId}</span>
                    {entry.isInherited && (
                      <span className="ml-auto rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                        inherited
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Mappings section */}
          <div>
            <div className="mb-2 text-xs font-semibold text-slate-700">
              Referenced in {report.mappings.length}{' '}
              {report.mappings.length === 1 ? 'mapping' : 'mappings'}
            </div>
            {report.mappings.length === 0 ? (
              <div className="text-xs text-slate-400">Not referenced in any mapping.</div>
            ) : (
              <div className="space-y-2">
                {report.mappings.map((entry) => (
                  <div
                    key={entry.objectTypeExternalId}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800">
                        {entry.objectTypeExternalId}
                      </span>
                      {entry.externalIdPart && (
                        <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                          externalIdPart
                        </span>
                      )}
                    </div>
                    {entry.attributeLocators.length > 0 && (
                      <div className="mt-1 text-slate-500">
                        Locators:{' '}
                        <span className="font-mono">
                          {entry.attributeLocators.join(', ')}
                        </span>
                      </div>
                    )}
                    {entry.objectMappingIQL && (
                      <div className="mt-1 text-slate-500">
                        IQL:{' '}
                        <span className="font-mono text-slate-700">{entry.objectMappingIQL}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
