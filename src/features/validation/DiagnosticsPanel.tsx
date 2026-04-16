'use client';

import { useMemo, useState } from 'react';
import { Panel } from '@/components/Panel';
import { useDocumentStore } from '@/stores/documentStore';
import { flattenObjectTypes } from '@/domain/selectors/indexes';
import { applyDropAndRecreate, applyQuickFix, canAutoApplyQuickFix, canDropAndRecreate } from '@/domain/transformers/quickFix';
import { canApplySafeAutofix } from '@/domain/transformers/safeAutofix';
import { buildSemanticDiff } from '@/domain/transformers/semanticDiff';
import { isRuleEnabled, VALIDATION_RULES_BY_CODE } from '@/domain/validators/validationRules';
import type { Diagnostic, DiagnosticSeverity } from '@/domain/model/types';

type DiagnosticView = 'grouped' | 'flat';

const SEVERITY_ORDER: Record<DiagnosticSeverity, number> = { error: 0, warning: 1, info: 2 };

export function DiagnosticsPanel() {
  const diagnostics = useDocumentStore((state) => state.diagnostics);
  const document = useDocumentStore((state) => state.document);
  const baselineSnapshots = useDocumentStore((state) => state.baselineSnapshots);
  const focusedPath = useDocumentStore((state) => state.focusedPath);
  const deferredDiagnostics = useDocumentStore((state) => state.deferredDiagnostics);
  const deferDiagnostic = useDocumentStore((state) => state.deferDiagnostic);
  const undeferDiagnostic = useDocumentStore((state) => state.undeferDiagnostic);
  const clearAllDeferredDiagnostics = useDocumentStore((state) => state.clearAllDeferredDiagnostics);
  const setActiveView = useDocumentStore((state) => state.setActiveView);
  const setFocusedPath = useDocumentStore((state) => state.setFocusedPath);
  const setSelectedObjectTypeExternalId = useDocumentStore((state) => state.setSelectedObjectTypeExternalId);
  const setSelectedMappingExternalId = useDocumentStore((state) => state.setSelectedMappingExternalId);
  const updateDocument = useDocumentStore((state) => state.updateDocument);
  const applySafeAutofixAction = useDocumentStore((state) => state.applySafeAutofixAction);
  const validationPending = useDocumentStore((state) => state.validationPending);
  const validationConfig = useDocumentStore((state) => state.validationConfig);
  const [severity, setSeverity] = useState<'all' | DiagnosticSeverity>('all');
  const [view, setView] = useState<DiagnosticView>('grouped');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const isDeferred = (d: Diagnostic) =>
    deferredDiagnostics.some((x) => x.code === d.code && x.path === d.path);

  const flattened = useMemo(
    () => document ? flattenObjectTypes(document.schema.objectSchema.objectTypes) : [],
    [document],
  );

  // Apply validation config filter to diagnostics
  const enabledDiagnostics = useMemo(
    () => diagnostics.filter((item) => isRuleEnabled(item.code, validationConfig)),
    [diagnostics, validationConfig],
  );

  const visibleDiagnostics = useMemo(
    () => enabledDiagnostics.filter((item) => !isDeferred(item)),
    [enabledDiagnostics, deferredDiagnostics],
  );

  const filtered = useMemo(
    () => severity === 'all' ? visibleDiagnostics : visibleDiagnostics.filter((item) => item.severity === severity),
    [visibleDiagnostics, severity],
  );

  const summary = useMemo(() => ({
    error: visibleDiagnostics.filter((item) => item.severity === 'error').length,
    warning: visibleDiagnostics.filter((item) => item.severity === 'warning').length,
    info: visibleDiagnostics.filter((item) => item.severity === 'info').length,
  }), [visibleDiagnostics]);

  // Compute semantic diff findings against the latest baseline (if one exists).
  const latestBaseline = baselineSnapshots[0];
  const semanticFindings = useMemo(() => {
    if (!document || !latestBaseline?.document) {
      return [];
    }
    return buildSemanticDiff(latestBaseline.document, document);
  }, [document, latestBaseline]);

  // Apply validation config filter to semantic findings
  const enabledSemanticFindings = useMemo(
    () => semanticFindings.filter((item) => isRuleEnabled(item.code, validationConfig)),
    [semanticFindings, validationConfig],
  );

  const visibleSemanticFindings = useMemo(
    () => enabledSemanticFindings.filter((item) => !isDeferred(item)),
    [enabledSemanticFindings, deferredDiagnostics],
  );

  const filteredSemanticFindings = useMemo(
    () => severity === 'all' ? visibleSemanticFindings : visibleSemanticFindings.filter((item) => item.severity === severity),
    [visibleSemanticFindings, severity],
  );

  const disabledCount = useMemo(() => {
    const allCodes = new Set([
      ...diagnostics.map((d) => d.code),
      ...semanticFindings.map((d) => d.code),
    ]);
    return [...allCodes].filter((code) => !isRuleEnabled(code, validationConfig)).length;
  }, [diagnostics, semanticFindings, validationConfig]);

  // Combined list for grouped view (validation + semantic)
  const allCombined = useMemo(
    () => [...filtered, ...filteredSemanticFindings],
    [filtered, filteredSemanticFindings],
  );

  // Group combined diagnostics by code for grouped view
  const groupedByCode = useMemo(() => {
    const map = new Map<string, { diagnostics: Diagnostic[]; isSemantic: boolean }>();
    for (const d of allCombined) {
      const existing = map.get(d.code);
      if (existing) {
        existing.diagnostics.push(d);
      } else {
        map.set(d.code, { diagnostics: [d], isSemantic: false });
      }
    }
    // Mark groups that are purely semantic
    for (const [code, group] of map.entries()) {
      const allSemantic = group.diagnostics.every((d) =>
        filteredSemanticFindings.some((sf) => sf === d),
      );
      map.set(code, { ...group, isSemantic: allSemantic });
    }
    // Sort: errors first, warnings, then info
    return [...map.entries()].sort(([, a], [, b]) => {
      const aSeverity = a.diagnostics[0]?.severity ?? 'info';
      const bSeverity = b.diagnostics[0]?.severity ?? 'info';
      return SEVERITY_ORDER[aSeverity] - SEVERITY_ORDER[bSeverity];
    });
  }, [allCombined, filteredSemanticFindings]);

  const toggleGroup = (code: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const openDiagnostic = (path: string) => {
    setFocusedPath(path);

    if (path.startsWith('/mapping/objectTypeMappings/')) {
      const mappingIndex = Number(path.split('/')[3]);
      const mapping = document?.mapping.objectTypeMappings[mappingIndex];
      if (mapping) {
        setSelectedMappingExternalId(mapping.objectTypeExternalId);
        setActiveView('mapping');
        return;
      }
    }

    const matchingSchemaNode = flattened
      .filter((item) => path === item.jsonPath || path.startsWith(`${item.jsonPath}/`))
      .sort((left, right) => right.jsonPath.length - left.jsonPath.length)[0];

    if (matchingSchemaNode) {
      setSelectedObjectTypeExternalId(matchingSchemaNode.objectType.externalId);
      setActiveView('schema');
      return;
    }

    setActiveView('raw-json');
  };

  const applySuggestedFix = (diagnostic: Diagnostic) => {
    if (!document) {
      return;
    }

    const canApply = canAutoApplyQuickFix(diagnostic);
    if (!canApply) {
      openDiagnostic(diagnostic.path);
      return;
    }

    updateDocument((current) => applyQuickFix(current, diagnostic));
    openDiagnostic(diagnostic.path);
  };

  const applyDropAndRecreateFix = (diagnostic: Diagnostic) => {
    if (!document) return;
    updateDocument((current) => applyDropAndRecreate(current, diagnostic));
    // Navigate to the schema view with the affected object type selected
    if (diagnostic.metadata?.objectTypeExternalId) {
      setSelectedObjectTypeExternalId(diagnostic.metadata.objectTypeExternalId);
    }
    setActiveView('schema');
  };

  const handleApplySafeAutofix = (diagnostic: Diagnostic) => {
    applySafeAutofixAction(diagnostic);
    openDiagnostic(diagnostic.path);
  };

  const renderDiagnosticCard = (diagnostic: Diagnostic, key: string, showSafeAutofixButton: boolean) => (
    <div
      key={key}
      className={`rounded-md border p-3 ${
        focusedPath === diagnostic.path
          ? 'border-amber-300 bg-amber-50'
          : diagnostic.severity === 'error'
            ? 'border-red-200 bg-red-50/50'
            : diagnostic.severity === 'warning'
              ? 'border-amber-200 bg-amber-50/60'
              : 'border-sky-200 bg-sky-50/60'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium">{diagnostic.code}</div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
          diagnostic.severity === 'error'
            ? 'bg-red-100 text-red-700'
            : diagnostic.severity === 'warning'
              ? 'bg-amber-100 text-amber-700'
              : 'bg-sky-100 text-sky-700'
        }`}>
          {diagnostic.severity}
        </span>
      </div>
      <div className="text-sm">{diagnostic.message}</div>
      {diagnostic.suggestion ? (
        <div className="mt-1 rounded-md border border-slate-200 bg-white/80 px-2 py-1 text-xs text-slate-700">
          Suggested fix: {diagnostic.suggestion}
        </div>
      ) : null}
      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
        <span>{diagnostic.path}</span>
        <div className="flex items-center gap-2">
          {showSafeAutofixButton && canApplySafeAutofix(diagnostic) ? (
            <button
              className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700"
              onClick={() => handleApplySafeAutofix(diagnostic)}
            >
              Apply safe autofix
            </button>
          ) : null}
          {canDropAndRecreate(diagnostic) ? (
            <button
              className="rounded-md border border-orange-200 bg-orange-50 px-2 py-1 text-orange-700"
              onClick={() => applyDropAndRecreateFix(diagnostic)}
            >
              Drop &amp; recreate stub
            </button>
          ) : diagnostic.severity !== 'info' && diagnostic.suggestion && !showSafeAutofixButton ? (
            <button
              className={`rounded-md px-2 py-1 ${
                canAutoApplyQuickFix(diagnostic)
                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border border-slate-200 bg-white text-slate-700'
              }`}
              onClick={() => applySuggestedFix(diagnostic)}
            >
              {canAutoApplyQuickFix(diagnostic) ? 'Apply suggested fix' : 'Review suggested fix'}
            </button>
          ) : null}
          <button
            className="rounded-md border border-slate-200 px-2 py-1"
            onClick={() => openDiagnostic(diagnostic.path)}
          >
            Locate issue
          </button>
          {!isDeferred(diagnostic) && (
            <button
              className="btn-ghost text-xs"
              onClick={() => deferDiagnostic(diagnostic.code, diagnostic.path)}
            >
              Defer
            </button>
          )}
        </div>
      </div>
      {diagnostic.relatedPaths && diagnostic.relatedPaths.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-slate-500">
          <span className="text-slate-400">Related:</span>
          {diagnostic.relatedPaths.map((relatedPath) => (
            <button
              key={`${diagnostic.code}-${diagnostic.path}-${relatedPath}`}
              className="rounded border border-slate-200 bg-white px-2 py-0.5"
              onClick={() => openDiagnostic(relatedPath)}
            >
              {relatedPath}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

  return (
    <Panel>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Diagnostics</h2>
          {validationPending && <span className="text-xs text-slate-400">Validating…</span>}
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-md border border-slate-200 overflow-hidden text-xs">
            <button
              className={`px-3 py-1.5 ${view === 'grouped' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              onClick={() => setView('grouped')}
            >
              By Rule
            </button>
            <button
              className={`px-3 py-1.5 border-l border-slate-200 ${view === 'flat' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              onClick={() => setView('flat')}
            >
              Flat list
            </button>
          </div>
          {view === 'flat' && (
            <select
              className="rounded-md border border-slate-200 px-2 py-1 text-xs"
              value={severity}
              onChange={(event) => setSeverity(event.target.value as 'all' | DiagnosticSeverity)}
            >
              <option value="all">All severities</option>
              <option value="error">Errors</option>
              <option value="warning">Warnings</option>
              <option value="info">Info</option>
            </select>
          )}
        </div>
      </div>
      <div className="mb-3 text-xs text-slate-500">
        Errors: {summary.error} · Warnings: {summary.warning} · Info: {summary.info}
        {disabledCount > 0 && (
          <span className="ml-2 text-slate-400">· {disabledCount} rule code(s) suppressed by settings</span>
        )}
      </div>

      {view === 'grouped' ? (
        /* ---- Grouped by rule view ---- */
        <div className="space-y-3">
          {groupedByCode.length === 0 ? (
            <div className="text-sm text-slate-500">No diagnostics.</div>
          ) : groupedByCode.map(([code, group]) => {
            const ruleDef = VALIDATION_RULES_BY_CODE.get(code);
            const ruleName = ruleDef?.name ?? code;
            const firstSeverity = group.diagnostics[0]?.severity ?? 'info';
            const isCollapsed = collapsedGroups.has(code);

            return (
              <div key={code} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                <button
                  className="w-full flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-slate-50 transition-colors text-left"
                  onClick={() => toggleGroup(code)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-sm truncate">{ruleName}</span>
                    {group.isSemantic && latestBaseline && (
                      <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 whitespace-nowrap">
                        vs {latestBaseline.name}
                      </span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${
                      firstSeverity === 'error'
                        ? 'bg-red-100 text-red-700'
                        : firstSeverity === 'warning'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-sky-100 text-sky-700'
                    }`}>
                      {firstSeverity}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 whitespace-nowrap">
                      {group.diagnostics.length}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono truncate hidden sm:block">{code}</span>
                  </div>
                  <span className="text-slate-400 text-xs shrink-0">{isCollapsed ? '▶' : '▼'}</span>
                </button>
                {!isCollapsed && (
                  <div className="px-4 pb-3 space-y-2 border-t border-slate-100 pt-3">
                    {group.diagnostics.map((diagnostic, index) =>
                      renderDiagnosticCard(
                        diagnostic,
                        `grouped-${code}-${index}`,
                        group.isSemantic,
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* ---- Flat list view ---- */
        <>
          <div className="space-y-2">
            {filtered.length === 0 ? (
              <div className="text-sm text-slate-500">No diagnostics.</div>
            ) : filtered.map((diagnostic) =>
              renderDiagnosticCard(
                diagnostic,
                `${diagnostic.code}-${diagnostic.path}`,
                false,
              )
            )}
          </div>

          {latestBaseline && filteredSemanticFindings.length > 0 ? (
            <div className="mt-6">
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-base font-semibold">Baseline Semantic Findings</h3>
                <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                  vs {latestBaseline.name}
                </span>
              </div>
              <p className="mb-3 text-xs text-slate-500">
                Changes detected between the current document and the latest baseline snapshot.
                Use "Apply safe autofix" to revert individual changes automatically.
              </p>
              <div className="space-y-2">
                {filteredSemanticFindings.map((finding, index) =>
                  renderDiagnosticCard(
                    finding,
                    `semantic-${finding.code}-${finding.path}-${index}`,
                    true,
                  )
                )}
              </div>
            </div>
          ) : latestBaseline && semanticFindings.length === 0 ? (
            <div className="mt-6">
              <h3 className="mb-2 text-base font-semibold">Baseline Semantic Findings</h3>
              <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                No semantic differences detected against baseline "{latestBaseline.name}".
              </div>
            </div>
          ) : null}
        </>
      )}

      {/* Deferred diagnostics section */}
      {deferredDiagnostics.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Deferred ({deferredDiagnostics.length})
            </span>
            <button className="btn-ghost text-xs" onClick={clearAllDeferredDiagnostics}>
              Clear all deferred
            </button>
          </div>
          <div className="space-y-1">
            {deferredDiagnostics.map((entry) => (
              <div
                key={`${entry.code}::${entry.path}`}
                className="flex items-center justify-between rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="lozenge bg-amber-100 text-amber-800">Deferred</span>
                  <span className="font-mono text-slate-600">{entry.code}</span>
                  <span className="text-slate-500">{entry.path}</span>
                </div>
                <button
                  className="btn-ghost text-xs"
                  onClick={() => undeferDiagnostic(entry.code, entry.path)}
                >
                  Un-defer
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

