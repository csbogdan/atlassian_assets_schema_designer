'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SchemaTree } from '@/features/schema/SchemaTree';
import { MappingExplorer } from '@/features/mapping/MappingExplorer';
import { DiagnosticsPanel } from '@/features/validation/DiagnosticsPanel';
import { MappingGenerator } from '@/features/generator/MappingGenerator';
import { RawJsonEditor } from '@/features/schema/RawJsonEditor';
import { DiffPanel } from '@/features/diff/DiffPanel';
import { ProjectWorkspace } from '@/features/project/ProjectWorkspace';
import { ProjectSettingsPanel } from '@/features/settings/ProjectSettingsPanel';
import { ToolsPanel } from '@/features/tools/ToolsPanel';
import { CommandPalette } from '@/features/search/CommandPalette';
import { StatsDashboard } from '@/features/schema/StatsDashboard';
import { HelpPanel } from '@/features/help/HelpPanel';
import { WhatsNewBanner } from '@/features/whats-new/WhatsNewBanner';
import { flattenObjectTypes } from '@/domain/selectors/indexes';
import { useShallow } from 'zustand/react/shallow';
import { useDocumentStore, type AppView, setLocalStorageQuotaHandler } from '@/stores/documentStore';
import { useValidationWorker } from '@/hooks/useValidationWorker';
import { UserMenuClient } from '@/components/UserMenuClient';
import { Tooltip } from '@/components/Tooltip';

export default function HomePage() {
  useValidationWorker();
  const activeView = useDocumentStore((state) => state.activeView);
  const setActiveView = useDocumentStore((state) => state.setActiveView);
  const document = useDocumentStore((state) => state.document);
  const { projectName, projectStatus, diskProjectId, dirty } = useDocumentStore(
    useShallow((state) => ({
      projectName: state.projectName,
      projectStatus: state.projectStatus,
      diskProjectId: state.diskProjectId,
      dirty: state.dirty,
    }))
  );
  const loadDiskProject = useDocumentStore((state) => state.loadDiskProject);
  const diagnostics = useDocumentStore((state) => state.diagnostics);
  const saveDiskProject = useDocumentStore((state) => state.saveDiskProject);
  const saveProjectVersion = useDocumentStore((state) => state.saveProjectVersion);
  const undoDocument = useDocumentStore((state) => state.undoDocument);
  const redoDocument = useDocumentStore((state) => state.redoDocument);

  // Fallback: Zustand's onRehydrateStorage isn't reliable in Next.js App Router.
  // On hard refresh, localStorage may have a diskProjectId but no document —
  // detect that and reload from the server API once on mount.
  useEffect(() => {
    const state = useDocumentStore.getState();
    if (state.diskProjectId && !state.document) {
      void state.loadDiskProject(state.diskProjectId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const saveMessageTimerRef = useRef<number | undefined>(undefined);
  const setSaveMessageWithTimeout = useCallback((msg: string) => {
    setSaveMessage(msg);
    if (saveMessageTimerRef.current) window.clearTimeout(saveMessageTimerRef.current);
    if (msg) saveMessageTimerRef.current = window.setTimeout(() => setSaveMessage(''), 3000);
  }, []);
  const [isDiskAutoSaving, setIsDiskAutoSaving] = useState(false);
  const [isGoToMode, setIsGoToMode] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isWhatsNewOpen, setIsWhatsNewOpen] = useState(false);
  const goToModeTimerRef = useRef<number | undefined>(undefined);
  const isFirstRenderRef = useRef(true);

  // Register localStorage quota exceeded handler
  useEffect(() => {
    setLocalStorageQuotaHandler(() => {
      setSaveMessageWithTimeout('Workspace full. Clear some projects to free space.');
    });
    return () => setLocalStorageQuotaHandler(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save to disk when changes are detected.
  // Skips the initial mount to avoid triggering a save on hydration.
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }

    if (!dirty) {
      return;
    }

    setIsDiskAutoSaving(true);

    const handle = window.setTimeout(async () => {
      await saveDiskProject();
      setIsDiskAutoSaving(false);
    }, 8000);

    return () => {
      window.clearTimeout(handle);
      setIsDiskAutoSaving(false);
    };
  }, [dirty, saveDiskProject]);

  // Tab items — "project" is accessed via the header project switcher, not a tab
  const tabItems = useMemo<Array<{ id: AppView; label: string }>>(
    () => [
      { id: 'dashboard', label: 'Overview' },
      { id: 'schema', label: 'Schema' },
      { id: 'mapping', label: 'Mapping' },
      { id: 'validation', label: 'Validation' },
      { id: 'generator', label: 'Generator' },
      { id: 'diff', label: 'Diff' },
      { id: 'tools', label: 'Tools' },
      { id: 'raw-json', label: 'Raw JSON' },
      { id: 'settings', label: 'Settings' },
    ],
    [],
  );

  // Legacy: keep navItems alias for keyboard shortcut map
  const navItems = useMemo(() => [
    { id: 'project' as AppView, label: 'Projects' },
    ...tabItems,
  ], [tabItems]);

  const renderView = () => {
    if (activeView === 'project') {
      return <ProjectWorkspace />;
    }

    if (activeView === 'schema') {
      return <SchemaTree />;
    }

    if (activeView === 'mapping') {
      return <MappingExplorer />;
    }

    if (activeView === 'validation') {
      return <DiagnosticsPanel />;
    }

    if (activeView === 'generator') {
      return <MappingGenerator />;
    }

    if (activeView === 'diff') {
      return <DiffPanel />;
    }

    if (activeView === 'tools') {
      return <ToolsPanel />;
    }

    if (activeView === 'raw-json') {
      return <RawJsonEditor />;
    }

    if (activeView === 'settings') {
      return <ProjectSettingsPanel />;
    }

    const objectTypeCount = document
      ? flattenObjectTypes(document.schema.objectSchema.objectTypes).length
      : 0;
    const mappingCount = document?.mapping.objectTypeMappings.length ?? 0;
    const errorCount = diagnostics.filter((item) => item.severity === 'error').length;
    const warningCount = diagnostics.filter((item) => item.severity === 'warning').length;

    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
          <DashboardCard label="Object Types (Total)" value={String(objectTypeCount)} />
          <DashboardCard label="Mappings (Total)" value={String(mappingCount)} />
          <DashboardCard label="Errors" value={String(errorCount)} />
          <DashboardCard label="Warnings" value={String(warningCount)} />
        </div>
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-900">Quick Actions</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => setActiveView('schema')}>Schema Explorer</button>
            <button className="btn-primary" onClick={() => setActiveView('mapping')}>Mapping Explorer</button>
            <button className="btn-secondary" onClick={() => setActiveView('validation')}>Diagnostics</button>
            <button className="btn-secondary" onClick={() => setActiveView('raw-json')}>Raw JSON</button>
          </div>
        </div>
        <StatsDashboard />
      </div>
    );
  };

  const activeViewLabel = navItems.find((item) => item.id === activeView)?.label;

  const handleGlobalSave = useCallback(async () => {
    if (!document) {
      setSaveMessageWithTimeout('Nothing to save yet.');
      return;
    }

    const result = await saveDiskProject();
    setSaveMessageWithTimeout(result.message);
  }, [document, saveDiskProject]);

  const handleGlobalSaveVersion = useCallback(() => {
    if (!document) {
      setSaveMessageWithTimeout('Nothing to version yet.');
      return;
    }

    const versionName = `Shortcut Save ${new Date().toLocaleTimeString()}`;
    saveProjectVersion(versionName);
    setSaveMessageWithTimeout(`Saved version "${versionName}".`);
  }, [document, saveProjectVersion]);

  useEffect(() => {
    const clearGoToMode = () => {
      setIsGoToMode(false);
      if (goToModeTimerRef.current) {
        window.clearTimeout(goToModeTimerRef.current);
        goToModeTimerRef.current = undefined;
      }
    };

    const startGoToMode = () => {
      setIsGoToMode(true);
      if (goToModeTimerRef.current) {
        window.clearTimeout(goToModeTimerRef.current);
      }
      goToModeTimerRef.current = window.setTimeout(() => {
        setIsGoToMode(false);
      }, 1200);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const isEditable = Boolean(
        target?.isContentEditable
        || tagName === 'input'
        || tagName === 'textarea'
        || tagName === 'select',
      );

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (event.shiftKey) {
          handleGlobalSaveVersion();
        } else {
          void handleGlobalSave();
        }
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        undoDocument();
        setSaveMessageWithTimeout('Undo applied.');
        return;
      }

      if (
        (event.metaKey || event.ctrlKey)
        && (
          (event.key.toLowerCase() === 'z' && event.shiftKey)
          || event.key.toLowerCase() === 'y'
        )
      ) {
        event.preventDefault();
        redoDocument();
        setSaveMessageWithTimeout('Redo applied.');
        return;
      }

      if (event.key === 'Escape') {
        setIsNavOpen(false);
        setIsHelpOpen(false);
        clearGoToMode();
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (isEditable) {
        return;
      }

      const key = event.key.toLowerCase();

      if (event.key === '?') {
        event.preventDefault();
        setIsHelpOpen(true);
        return;
      }

      if (isGoToMode) {
        const viewMap: Partial<Record<string, AppView>> = {
          p: 'project',
          d: 'dashboard',
          s: 'schema',
          m: 'mapping',
          v: 'validation',
          g: 'generator',
          f: 'diff',
          r: 'raw-json',
        };

        const targetView = viewMap[key];
        if (targetView) {
          event.preventDefault();
          setActiveView(targetView);
          setIsNavOpen(false);
          clearGoToMode();
        }
        return;
      }

      if (key === 'g') {
        event.preventDefault();
        startGoToMode();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (goToModeTimerRef.current) {
        window.clearTimeout(goToModeTimerRef.current);
      }
    };
  }, [document, handleGlobalSave, handleGlobalSaveVersion, redoDocument, setActiveView, undoDocument]);

  // "Projects" panel open state (replaces sidebar nav item)
  const [isProjectsPanelOpen, setIsProjectsPanelOpen] = useState(false);

  const effectiveView = activeView === 'project' ? 'dashboard' : activeView;

  return (
    <div className="flex min-h-screen flex-col bg-[#F4F5F7]">
      {/* ── Top bar ────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-2.5 sm:px-6">
          {/* Brand */}
          <span className="mr-2 shrink-0 text-sm font-bold tracking-tight text-slate-900">
            JSM Assets
          </span>

          {/* Project switcher */}
          <button
            className={`flex items-center gap-1.5 rounded-[3px] border px-3 py-1.5 text-sm font-medium transition-colors duration-100 ${
              isProjectsPanelOpen
                ? 'border-blue-300 bg-blue-50 text-blue-700'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
            onClick={() => setIsProjectsPanelOpen((v) => !v)}
            title="Manage projects"
          >
            <span className="max-w-[180px] truncate">
              {diskProjectId ? (projectName || 'Untitled Project') : 'Projects'}
            </span>
            {diskProjectId && (
              <span className={`lozenge ml-1 ${
                projectStatus === 'open' ? 'bg-emerald-100 text-emerald-700' :
                projectStatus === 'archived' ? 'bg-amber-100 text-amber-700' :
                'bg-slate-100 text-slate-600'
              }`}>
                {projectStatus}
              </span>
            )}
            <svg className="ml-1 h-3 w-3 shrink-0 text-slate-400" viewBox="0 0 12 12" fill="currentColor">
              <path d="M6 8L1 3h10L6 8z"/>
            </svg>
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Diagnostics summary */}
          {document && (
            <div className="hidden items-center gap-2 sm:flex">
              {diagnostics.filter((d) => d.severity === 'error').length > 0 && (
                <button
                  className="lozenge bg-red-100 text-red-700 hover:bg-red-200"
                  onClick={() => setActiveView('validation')}
                  title="View errors"
                >
                  {diagnostics.filter((d) => d.severity === 'error').length} error{diagnostics.filter((d) => d.severity === 'error').length !== 1 ? 's' : ''}
                </button>
              )}
              {diagnostics.filter((d) => d.severity === 'warning').length > 0 && (
                <button
                  className="lozenge bg-amber-100 text-amber-700 hover:bg-amber-200"
                  onClick={() => setActiveView('validation')}
                  title="View warnings"
                >
                  {diagnostics.filter((d) => d.severity === 'warning').length} warning{diagnostics.filter((d) => d.severity === 'warning').length !== 1 ? 's' : ''}
                </button>
              )}
            </div>
          )}

          {/* Save state */}
          <span className={`lozenge hidden sm:inline-flex ${
            isDiskAutoSaving ? 'bg-blue-100 text-blue-700' :
            dirty ? 'bg-amber-100 text-amber-700' :
            diskProjectId ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
          }`}>
            {isDiskAutoSaving ? 'Saving…' : dirty ? 'Unsaved' : diskProjectId ? 'Saved' : 'No project'}
          </span>

          {/* Actions */}
          {document && (
            <Tooltip content="Save (⌘S)" placement="bottom">
              <button className="btn-primary" onClick={handleGlobalSave}>
                Save
              </button>
            </Tooltip>
          )}
          <UserMenuClient />
          <Tooltip content="What's New" placement="bottom">
            <button className="btn-ghost hidden sm:inline-flex" onClick={() => setIsWhatsNewOpen(true)} aria-label="What's new">
              ✨
            </button>
          </Tooltip>
          <Tooltip content="Keyboard shortcuts (?)" placement="bottom">
            <button className="btn-ghost hidden sm:inline-flex" onClick={() => setIsHelpOpen(true)} aria-label="Help & documentation">
              ?
            </button>
          </Tooltip>
          {/* Mobile nav toggle */}
          <button className="btn-secondary sm:hidden" onClick={() => setIsNavOpen(true)}>
            ☰
          </button>
        </div>

        {/* ── Tab bar ─────────────────────────────────────────────── */}
        <div className="mx-auto hidden max-w-[1600px] overflow-x-auto px-4 sm:flex sm:px-6">
          {tabItems.map((item) => {
            const active = effectiveView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`relative shrink-0 px-4 py-2.5 text-sm font-medium transition-colors duration-100 ${
                  active
                    ? 'text-blue-600'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
                {active && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-blue-600" />
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* ── Projects modal ───────────────────────────────────────── */}
      {isProjectsPanelOpen && (
        <div
          className="fixed inset-0 z-[70] bg-slate-950/50 backdrop-blur-[3px]"
          onClick={() => setIsProjectsPanelOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Projects"
        >
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl ring-1 ring-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <ProjectWorkspace onClose={() => setIsProjectsPanelOpen(false)} />
          </div>
        </div>
      )}

      {/* ── Save feedback ────────────────────────────────────────── */}
      {saveMessage && (
        <div className="border-b border-blue-200 bg-blue-50 px-6 py-2 text-sm text-blue-800">
          {saveMessage}
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-[1600px] flex-1 p-4 sm:p-6">
        {renderView()}
      </main>

      {/* ── Mobile nav overlay ───────────────────────────────────── */}
      {isNavOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-[2px] sm:hidden" role="dialog" aria-modal="true">
          <div className="absolute right-0 top-0 h-full w-64 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <span className="text-sm font-semibold text-slate-800">Navigation</span>
              <button className="btn-ghost" onClick={() => setIsNavOpen(false)}>✕</button>
            </div>
            <nav className="p-2">
              <button
                className={`w-full rounded-[3px] px-3 py-2 text-left text-sm font-medium transition-colors ${
                  isProjectsPanelOpen ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'
                }`}
                onClick={() => { setIsProjectsPanelOpen((v) => !v); setIsNavOpen(false); }}
              >
                Projects
              </button>
              {tabItems.map((item) => {
                const active = effectiveView === item.id;
                return (
                  <button
                    key={item.id}
                    className={`w-full rounded-[3px] px-3 py-2 text-left text-sm font-medium transition-colors ${
                      active ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                    onClick={() => { setActiveView(item.id); setIsNavOpen(false); }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      <HelpPanel open={isHelpOpen} onClose={() => setIsHelpOpen(false)} />

      <CommandPalette />

      <WhatsNewBanner forceOpen={isWhatsNewOpen} onClose={() => setIsWhatsNewOpen(false)} />
    </div>
  );
}

function DashboardCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-5">
      <div className="text-xs font-medium uppercase tracking-widest text-slate-400">{label}</div>
      <div className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">{value}</div>
    </div>
  );
}
