'use client';

import { useMemo } from 'react';
import { useDocumentStore } from '@/stores/documentStore';
import { computeSchemaStats } from '@/domain/selectors/schemaStats';

export function StatsDashboard() {
  const document = useDocumentStore((state) => state.document);

  const stats = useMemo(
    () => (document ? computeSchemaStats(document) : null),
    [document],
  );

  if (!stats) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-400">
        No document loaded. Open a project to view schema statistics.
      </div>
    );
  }

  const attributeEntries = Object.entries(stats.attributeCountByType).sort(
    ([, a], [, b]) => b - a,
  );
  const maxAttributeCount = Math.max(1, ...attributeEntries.map(([, count]) => count));

  const depthEntries = Object.entries(stats.inheritanceDepthDistribution)
    .map(([depth, count]) => ({ depth: Number(depth), count }))
    .sort((a, b) => a.depth - b.depth);
  const maxDepthCount = Math.max(1, ...depthEntries.map((entry) => entry.count));

  const mappedPct = stats.mappingCoveragePercent;
  const unmappedPct = Math.round((100 - mappedPct) * 10) / 10;

  return (
    <div className="space-y-4">
      {/* Stat cards row */}
      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        <StatCard
          label="Object Types"
          value={String(stats.objectTypeCount)}
        />
        <StatCard
          label="Total Attributes"
          value={String(stats.totalAttributeCount)}
        />
        <StatCard
          label="Mapping Coverage"
          value={`${stats.mappingCoveragePercent}%`}
        />
        <StatCard
          label="Types with No Attributes"
          value={String(stats.typesWithNoAttributes)}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Attribute distribution */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">
            Attribute Distribution by Type
          </h3>
          {attributeEntries.length === 0 ? (
            <div className="text-sm text-slate-400">No attributes found.</div>
          ) : (
            <div className="space-y-2">
              {attributeEntries.map(([type, count]) => (
                <div key={type} className="grid items-center gap-3" style={{ gridTemplateColumns: '10rem 2rem 1fr' }}>
                  <span className="truncate text-xs text-slate-700" title={type}>
                    {type}
                  </span>
                  <span className="text-right text-xs font-medium text-slate-500">
                    {count}
                  </span>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-blue-400"
                      style={{ width: `${Math.round((count / maxAttributeCount) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Inheritance depth */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">
            Inheritance Depth Distribution
          </h3>
          {depthEntries.length === 0 ? (
            <div className="text-sm text-slate-400">No types found.</div>
          ) : (
            <div className="space-y-2">
              {depthEntries.map(({ depth, count }) => (
                <div key={depth} className="grid items-center gap-3" style={{ gridTemplateColumns: '6rem 2rem 1fr' }}>
                  <span className="text-xs text-slate-700">Depth {depth}</span>
                  <span className="text-right text-xs font-medium text-slate-500">
                    {count}
                  </span>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-indigo-400"
                      style={{ width: `${Math.round((count / maxDepthCount) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mapped vs unmapped */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">
          Mapped vs Unmapped Object Types
        </h3>
        <div className="flex h-4 overflow-hidden rounded-full bg-slate-200">
          {stats.objectTypeCount > 0 ? (
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${mappedPct}%` }}
              role="presentation"
            />
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />
            Mapped: {stats.mappedObjectTypeCount} ({mappedPct}%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-slate-300" />
            Unmapped: {stats.unmappedObjectTypeCount} ({unmappedPct}%)
          </span>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}
