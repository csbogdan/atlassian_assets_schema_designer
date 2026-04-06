'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Panel } from '@/components/Panel';
import { analyzeImpact } from '@/domain/transformers/impactAnalysis';
import { applySafeAutofix, canApplySafeAutofix } from '@/domain/transformers/safeAutofix';
import { buildSemanticDiff } from '@/domain/transformers/semanticDiff';
import { useDocumentStore } from '@/stores/documentStore';
import type { AssetsImportDocument } from '@/domain/model/types';
import type { ProjectVersion } from '@/stores/documentStore';
import { ChangelogPanel } from './ChangelogPanel';

const CURRENT_SENTINEL = '__current__';
const REMOTE_SENTINEL = '__remote__';

type SourceId = typeof CURRENT_SENTINEL | typeof REMOTE_SENTINEL | string;

function resolveSource(
  sourceId: SourceId,
  currentDocument: AssetsImportDocument | undefined,
  allVersions: ProjectVersion[],
  remoteDocument: AssetsImportDocument | null,
): AssetsImportDocument | undefined {
  if (sourceId === CURRENT_SENTINEL) return currentDocument;
  if (sourceId === REMOTE_SENTINEL) return remoteDocument ?? undefined;
  return allVersions.find((v) => v.id === sourceId)?.document;
}

function resolveLabel(
  sourceId: SourceId,
  projectName: string,
  allVersions: ProjectVersion[],
): string {
  if (sourceId === CURRENT_SENTINEL) return projectName;
  if (sourceId === REMOTE_SENTINEL) return 'Remote (live)';
  return allVersions.find((v) => v.id === sourceId)?.name ?? sourceId;
}

function resolveCreatedAt(
  sourceId: SourceId,
  allVersions: ProjectVersion[],
): string | undefined {
  if (sourceId === CURRENT_SENTINEL) return undefined;
  if (sourceId === REMOTE_SENTINEL) return undefined;
  return allVersions.find((v) => v.id === sourceId)?.createdAt;
}

export function DiffPanel() {
  const currentDocument = useDocumentStore((state) => state.document);
  const projectName = useDocumentStore((state) => state.projectName);
  const baselineSnapshots = useDocumentStore((state) => state.baselineSnapshots);
  const projectVersions = useDocumentStore((state) => state.projectVersions);
  const saveBaselineSnapshot = useDocumentStore((state) => state.saveBaselineSnapshot);
  const deleteBaselineSnapshot = useDocumentStore((state) => state.deleteBaselineSnapshot);
  const setFocusedPath = useDocumentStore((state) => state.setFocusedPath);
  const setActiveView = useDocumentStore((state) => state.setActiveView);
  const updateDocument = useDocumentStore((state) => state.updateDocument);
  const environments = useDocumentStore((state) => state.environments);

  const allVersions: ProjectVersion[] = useMemo(
    () => [...baselineSnapshots, ...projectVersions],
    [baselineSnapshots, projectVersions],
  );

  const defaultLeftId: SourceId = allVersions[0]?.id ?? CURRENT_SENTINEL;

  const [leftSourceId, setLeftSourceId] = useState<SourceId>(defaultLeftId);
  const [rightSourceId, setRightSourceId] = useState<SourceId>(CURRENT_SENTINEL);

  // When versions load after mount (e.g. from disk), auto-select the first one on the left
  const leftInitialized = useRef(leftSourceId !== CURRENT_SENTINEL);
  useEffect(() => {
    if (!leftInitialized.current && allVersions.length > 0) {
      leftInitialized.current = true;
      setLeftSourceId(allVersions[0].id);
    }
  }, [allVersions]);

  // Remote fetch state
  const [remoteDocument, setRemoteDocument] = useState<AssetsImportDocument | null>(null);
  const [remoteSelectedEnvId, setRemoteSelectedEnvId] = useState('');
  const [remoteManualToken, setRemoteManualToken] = useState('');
  const [remoteFetching, setRemoteFetching] = useState(false);
  const [remoteError, setRemoteError] = useState('');
  const [remoteImportSourceId, setRemoteImportSourceId] = useState('');

  const remoteEnv = environments.find((e) => e.id === remoteSelectedEnvId) ?? environments[0] ?? null;
  const effectiveRemoteToken = remoteEnv?.token ?? remoteManualToken;

  const fetchRemote = async () => {
    if (!effectiveRemoteToken) return;
    setRemoteFetching(true);
    setRemoteError('');
    setRemoteDocument(null);
    setRemoteImportSourceId('');
    try {
      const r = await fetch('/api/tools/remote-diff', {
        method: 'POST',
        headers: { Authorization: `Bearer ${effectiveRemoteToken}` },
      });
      const data = await r.json() as {
        remoteDocument?: AssetsImportDocument;
        importSourceId?: string;
        error?: string;
      };
      if (!r.ok || data.error) {
        setRemoteError(data.error ?? 'Failed to fetch remote schema');
        return;
      }
      if (data.remoteDocument) {
        setRemoteDocument(data.remoteDocument);
        if (data.importSourceId) setRemoteImportSourceId(data.importSourceId);
        setLeftSourceId(REMOTE_SENTINEL);
        setRightSourceId(CURRENT_SENTINEL);
      }
    } catch (e) {
      setRemoteError(e instanceof Error ? e.message : String(e));
    } finally {
      setRemoteFetching(false);
    }
  };

  const clearRemote = () => {
    setRemoteDocument(null);
    setRemoteImportSourceId('');
    setRemoteError('');
    if (leftSourceId === REMOTE_SENTINEL) setLeftSourceId(defaultLeftId);
    if (rightSourceId === REMOTE_SENTINEL) setRightSourceId(CURRENT_SENTINEL);
  };

  const [baselineName, setBaselineName] = useState('');
  const [diffTab, setDiffTab] = useState<'semantic' | 'changelog'>('semantic');

  const leftDocument = useMemo(
    () => resolveSource(leftSourceId, currentDocument, allVersions, remoteDocument),
    [leftSourceId, currentDocument, allVersions, remoteDocument],
  );

  const rightDocument = useMemo(
    () => resolveSource(rightSourceId, currentDocument, allVersions, remoteDocument),
    [rightSourceId, currentDocument, allVersions, remoteDocument],
  );

  const semanticDiff = useMemo(() => {
    if (!leftDocument || !rightDocument) {
      return [];
    }
    return buildSemanticDiff(leftDocument, rightDocument);
  }, [leftDocument, rightDocument]);

  const impactDiff = useMemo(() => {
    if (!leftDocument || !rightDocument) {
      return [];
    }
    return analyzeImpact(leftDocument, rightDocument);
  }, [leftDocument, rightDocument]);

  const combined = [...impactDiff, ...semanticDiff];
  const errorCount = combined.filter((item) => item.severity === 'error').length;
  const warningCount = combined.filter((item) => item.severity === 'warning').length;
  const infoCount = combined.filter((item) => item.severity === 'info').length;

  const autofixEnabled = rightSourceId === CURRENT_SENTINEL;

  const handleSwap = () => {
    setLeftSourceId(rightSourceId);
    setRightSourceId(leftSourceId);
  };

  const exportReport = () => {
    const leftLabel = resolveLabel(leftSourceId, projectName, allVersions);
    const rightLabel = resolveLabel(rightSourceId, projectName, allVersions);

    const payload = {
      left: leftLabel,
      right: rightLabel,
      generatedAt: new Date().toISOString(),
      summary: {
        errors: errorCount,
        warnings: warningCount,
        info: infoCount,
      },
      semantic: semanticDiff,
      impact: impactDiff,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = 'semantic-impact-report.json';
    window.document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const runSafeAutofix = (index: number) => {
    if (!rightDocument || !leftDocument || !autofixEnabled) {
      return;
    }

    const finding = combined[index];
    if (!finding || !canApplySafeAutofix(finding)) {
      return;
    }

    updateDocument((draft) => applySafeAutofix(draft, leftDocument, finding));
  };

  const hasAnySources = baselineSnapshots.length > 0 || projectVersions.length > 0 || remoteDocument !== null;

  const SourceSelector = ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: SourceId;
    onChange: (id: SourceId) => void;
  }) => {
    const createdAt = resolveCreatedAt(value, allVersions);
    const displayName = resolveLabel(value, projectName, allVersions);

    return (
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        <select
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value={CURRENT_SENTINEL}>Current document</option>
          {remoteDocument && (
            <option value={REMOTE_SENTINEL}>Remote (live)</option>
          )}
          {baselineSnapshots.length > 0 && (
            <optgroup label="Baselines">
              {baselineSnapshots.map((snapshot) => (
                <option key={snapshot.id} value={snapshot.id}>
                  {snapshot.name} ({new Date(snapshot.createdAt).toLocaleString()})
                </option>
              ))}
            </optgroup>
          )}
          {projectVersions.length > 0 && (
            <optgroup label="Versions">
              {projectVersions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.name} ({new Date(version.createdAt).toLocaleString()})
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <div className="truncate text-xs text-slate-400">
          {value === CURRENT_SENTINEL ? (
            <span>Unsaved changes — {displayName}</span>
          ) : value === REMOTE_SENTINEL ? (
            <span>Live remote{remoteImportSourceId ? ` — ${remoteImportSourceId}` : ''}</span>
          ) : createdAt ? (
            <span suppressHydrationWarning>{displayName} &mdash; {new Date(createdAt).toLocaleString()}</span>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <Panel>
      <h2 className="mb-3 text-lg font-semibold">Diff & Impact Analysis</h2>
      {!currentDocument ? (
        <p className="text-sm text-slate-600">Load a project document first to compare versions.</p>
      ) : (
        <div className="space-y-3">
          {/* Capture baseline toolbar */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Baselines</div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                value={baselineName}
                onChange={(event) => setBaselineName(event.target.value)}
                placeholder="Baseline name (optional)"
              />
              <button
                className="rounded-md bg-slate-900 px-3 py-1 text-xs text-white"
                onClick={() => {
                  saveBaselineSnapshot(baselineName || undefined);
                  setBaselineName('');
                }}
              >
                Capture baseline
              </button>
              {leftSourceId !== CURRENT_SENTINEL &&
                baselineSnapshots.some((b) => b.id === leftSourceId) && (
                  <button
                    className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700"
                    onClick={() => {
                      deleteBaselineSnapshot(leftSourceId);
                      setLeftSourceId(defaultLeftId !== leftSourceId ? defaultLeftId : CURRENT_SENTINEL);
                    }}
                  >
                    Delete left baseline
                  </button>
                )}
              {rightSourceId !== CURRENT_SENTINEL &&
                baselineSnapshots.some((b) => b.id === rightSourceId) && (
                  <button
                    className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700"
                    onClick={() => {
                      deleteBaselineSnapshot(rightSourceId);
                      setRightSourceId(CURRENT_SENTINEL);
                    }}
                  >
                    Delete right baseline
                  </button>
                )}
            </div>
          </div>

          {/* Source pickers — left ⇄ right */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Compare</div>
            {!hasAnySources ? (
              <p className="text-xs text-slate-500">
                Capture a baseline or save a version to enable multi-source comparison. Currently comparing current document against itself.
              </p>
            ) : null}
            <div className="flex items-start gap-2">
              <SourceSelector label="Left (base)" value={leftSourceId} onChange={setLeftSourceId} />
              <button
                className="mt-5 shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-100"
                title="Swap left and right"
                onClick={handleSwap}
              >
                ⇄ Swap
              </button>
              <SourceSelector label="Right (compare)" value={rightSourceId} onChange={setRightSourceId} />
            </div>
          </div>

          {/* Compare with Remote */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Compare with Remote</div>
              {remoteDocument && (
                <button
                  className="text-xs text-slate-400 hover:text-slate-600"
                  onClick={clearRemote}
                >
                  Clear
                </button>
              )}
            </div>
            {remoteDocument ? (
              <div className="text-xs text-green-700">
                Remote schema loaded{remoteImportSourceId ? ` (${remoteImportSourceId})` : ''}. Select &ldquo;Remote (live)&rdquo; in the source dropdowns above.
              </div>
            ) : (
              <div className="space-y-2">
                {environments.length > 0 ? (
                  <select
                    className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                    value={remoteSelectedEnvId || (environments[0]?.id ?? '')}
                    onChange={(e) => { setRemoteSelectedEnvId(e.target.value); setRemoteManualToken(''); }}
                  >
                    {environments.map((env) => (
                      <option key={env.id} value={env.id}>{env.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-mono"
                    type="password"
                    placeholder="Bearer token (ATATT3x…)"
                    value={remoteManualToken}
                    onChange={(e) => setRemoteManualToken(e.target.value)}
                  />
                )}
                {remoteError && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{remoteError}</div>
                )}
                <button
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  disabled={remoteFetching || !effectiveRemoteToken}
                  onClick={() => void fetchRemote()}
                >
                  {remoteFetching ? 'Fetching…' : 'Fetch remote & compare'}
                </button>
              </div>
            )}
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
            <button
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                diffTab === 'semantic'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              onClick={() => setDiffTab('semantic')}
            >
              Semantic diff
            </button>
            <button
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                diffTab === 'changelog'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              onClick={() => setDiffTab('changelog')}
            >
              Changelog
            </button>
          </div>

          {diffTab === 'semantic' && (
            <>
              {/* Summary counters */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Errors: {errorCount}</div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">Warnings: {warningCount}</div>
                <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-700">Info: {infoCount}</div>
              </div>

              {/* Export button */}
              <div className="flex justify-end">
                <button
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs disabled:opacity-50"
                  onClick={exportReport}
                  disabled={!leftDocument || !rightDocument}
                >
                  Export report
                </button>
              </div>

              {/* Findings */}
              {!leftDocument || !rightDocument ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                  Select valid sources on both sides to start comparison.
                </div>
              ) : combined.length === 0 ? (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                  No semantic or impact differences detected between the selected sources.
                </div>
              ) : (
                <div className="space-y-2">
                  {!autofixEnabled && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
                      Safe autofix is only available when the right source is &ldquo;Current document&rdquo;.
                    </div>
                  )}
                  {combined.map((item, index) => (
                    <div
                      key={`${item.code}-${item.path}-${index}`}
                      className={`rounded-md border p-3 ${
                        item.severity === 'error'
                          ? 'border-red-200 bg-red-50/60'
                          : item.severity === 'warning'
                            ? 'border-amber-200 bg-amber-50/60'
                            : 'border-sky-200 bg-sky-50/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium">{item.code}</div>
                        <span className="text-xs uppercase text-slate-500">{item.severity}</span>
                      </div>
                      <div className="text-sm">{item.message}</div>
                      {item.suggestion ? <div className="mt-1 text-xs text-slate-500">{item.suggestion}</div> : null}
                      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                        <span>{item.path}</span>
                        <div className="flex items-center gap-2">
                          {autofixEnabled && canApplySafeAutofix(item) ? (
                            <button
                              className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700"
                              onClick={() => runSafeAutofix(index)}
                            >
                              Apply safe autofix
                            </button>
                          ) : null}
                          <button
                            className="rounded border border-slate-200 bg-white px-2 py-0.5"
                            onClick={() => {
                              setFocusedPath(item.path);
                              setActiveView(item.path.startsWith('/mapping') ? 'mapping' : 'schema');
                            }}
                          >
                            Open
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {diffTab === 'changelog' && (
            <ChangelogPanel leftDocument={leftDocument} rightDocument={rightDocument} />
          )}
        </div>
      )}
    </Panel>
  );
}
