'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Panel } from '@/components/Panel';
import { ConfirmModal } from '@/components/ConfirmModal';
import { useDocumentStore } from '@/stores/documentStore';
import { parseAssetsImportDocument } from '@/domain/normalizers/normalizeAssetsImportDocument';
import { analyzeImpact } from '@/domain/transformers/impactAnalysis';
import { flattenObjectTypes } from '@/domain/selectors/indexes';

export function ProjectWorkspace({ onClose }: { onClose?: () => void } = {}) {
  const projectName = useDocumentStore((state) => state.projectName);
  const projectStatus = useDocumentStore((state) => state.projectStatus);
  const projectCreatedAt = useDocumentStore((state) => state.projectCreatedAt);
  const diskProjectId = useDocumentStore((state) => state.diskProjectId);
  const diskProjects = useDocumentStore((state) => state.diskProjects);
  const diskLastSyncedAt = useDocumentStore((state) => state.diskLastSyncedAt);
  const currentDocument = useDocumentStore((state) => state.document);
  const revision = useDocumentStore((state) => state.revision);
  const dirty = useDocumentStore((state) => state.dirty);
  const projectVersions = useDocumentStore((state) => state.projectVersions);
  const baselineSnapshots = useDocumentStore((state) => state.baselineSnapshots);
  const projectActivity = useDocumentStore((state) => state.projectActivity);
  const diagnostics = useDocumentStore((state) => state.diagnostics);
  const diskApiError = useDocumentStore((state) => state.diskApiError);
  const clearDiskApiError = useDocumentStore((state) => state.clearDiskApiError);
  const renameProject = useDocumentStore((state) => state.renameProject);
  const createProjectFromScratch = useDocumentStore((state) => state.createProjectFromScratch);
  const refreshDiskProjects = useDocumentStore((state) => state.refreshDiskProjects);
  const createDiskProject = useDocumentStore((state) => state.createDiskProject);
  const loadDiskProject = useDocumentStore((state) => state.loadDiskProject);
  const saveDiskProject = useDocumentStore((state) => state.saveDiskProject);
  const closeDiskProject = useDocumentStore((state) => state.closeDiskProject);
  const setDiskProjectStatus = useDocumentStore((state) => state.setDiskProjectStatus);
  const setDiskProjectGlobal = useDocumentStore((state) => state.setDiskProjectGlobal);
  const deleteDiskProject = useDocumentStore((state) => state.deleteDiskProject);
  const exportDiskProject = useDocumentStore((state) => state.exportDiskProject);
  const saveProjectVersion = useDocumentStore((state) => state.saveProjectVersion);
  const restoreProjectVersion = useDocumentStore((state) => state.restoreProjectVersion);
  const undoDocument = useDocumentStore((state) => state.undoDocument);
  const redoDocument = useDocumentStore((state) => state.redoDocument);
  const setActiveView = useDocumentStore((state) => state.setActiveView);
  const environments = useDocumentStore((state) => state.environments);
  const addEnvironment = useDocumentStore((state) => state.addEnvironment);
  const updateEnvironment = useDocumentStore((state) => state.updateEnvironment);
  const removeEnvironment = useDocumentStore((state) => state.removeEnvironment);

  const { data: session } = useSession();
  const currentUserId = session?.user?.id;

  const importInputRef = useRef<HTMLInputElement>(null);
  const [versionName, setVersionName] = useState('');
  const [renameValue, setRenameValue] = useState(projectName);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [newProjectModalName, setNewProjectModalName] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const statusTimerRef = useRef<number | undefined>(undefined);
  const setStatusMessageWithTimeout = (msg: string) => {
    setStatusMessage(msg);
    if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current);
    if (msg) statusTimerRef.current = window.setTimeout(() => setStatusMessage(''), 3000);
  };
  const [shareModalProjectId, setShareModalProjectId] = useState<string | undefined>(undefined);
  const [shareMode, setShareMode] = useState<'everyone' | 'specific'>('everyone');
  const [shareEmail, setShareEmail] = useState('');
  const [shareEmailResult, setShareEmailResult] = useState<{ found: boolean; error?: string } | undefined>(undefined);
  const [shareEmailChecking, setShareEmailChecking] = useState(false);
  const [compareFrom, setCompareFrom] = useState('current');
  const [compareTo, setCompareTo] = useState('current');
  const [pendingAction, setPendingAction] = useState<
    | { type: 'close-current' }
    | { type: 'archive-project'; id: string; name: string }
    | { type: 'delete-project'; id: string; name: string }
    | { type: 'restore-version'; id: string; name: string }
    | undefined
  >(undefined);
  const [showEnvs, setShowEnvs] = useState(false);
  const [newEnvName, setNewEnvName] = useState('');
  const [newEnvToken, setNewEnvToken] = useState('');
  const [editingEnvId, setEditingEnvId] = useState<string | null>(null);
  const [editEnvName, setEditEnvName] = useState('');
  const [editEnvToken, setEditEnvToken] = useState('');

  useEffect(() => {
    refreshDiskProjects();
  }, [refreshDiskProjects]);

  useEffect(() => {
    setRenameValue(projectName);
  }, [projectName]);

  const onImportFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseAssetsImportDocument(text);

    if (!parsed.document) {
      setStatusMessageWithTimeout('Import failed: invalid schema. Check the file and try again.');
      return;
    }

    await createDiskProject(file.name.replace(/\.json$/i, ''), parsed.document);
    setStatusMessageWithTimeout('Imported schema and created disk-backed project.');
  };

  const compareOptions = useMemo(() => {
    return [
      { id: 'current', label: 'Current working copy' },
      ...baselineSnapshots.map((baseline) => ({
        id: `baseline:${baseline.id}`,
        label: `Baseline · ${baseline.name} (${new Date(baseline.createdAt).toLocaleString()})`,
      })),
      ...projectVersions.map((version) => ({
        id: `version:${version.id}`,
        label: `${version.name} (${new Date(version.createdAt).toLocaleString()})`,
      })),
    ];
  }, [baselineSnapshots, projectVersions]);

  const resolveDocument = (value: string) => {
    if (value === 'current') {
      return currentDocument;
    }
    if (value.startsWith('baseline:')) {
      const baselineId = value.replace('baseline:', '');
      return baselineSnapshots.find((baseline) => baseline.id === baselineId)?.document;
    }
    const versionId = value.replace('version:', '');
    return projectVersions.find((version) => version.id === versionId)?.document;
  };

  const comparison = useMemo(() => {
    const fromDoc = resolveDocument(compareFrom);
    const toDoc = resolveDocument(compareTo);

    if (!fromDoc || !toDoc) {
      return undefined;
    }

    const fromTypes = flattenObjectTypes(fromDoc.schema.objectSchema.objectTypes).length;
    const toTypes = flattenObjectTypes(toDoc.schema.objectSchema.objectTypes).length;
    const fromMappings = fromDoc.mapping.objectTypeMappings.length;
    const toMappings = toDoc.mapping.objectTypeMappings.length;
    const impacts = analyzeImpact(fromDoc, toDoc);

    return {
      impacts,
      typeDelta: toTypes - fromTypes,
      mappingDelta: toMappings - fromMappings,
    };
  }, [compareFrom, compareTo, currentDocument, projectVersions]);

  const errorCount = diagnostics.filter((item) => item.severity === 'error').length;
  const warningCount = diagnostics.filter((item) => item.severity === 'warning').length;

  const confirmPendingAction = async () => {
    const action = pendingAction;
    if (!action) {
      return;
    }

    if (action.type === 'close-current') {
      await closeDiskProject();
      setStatusMessageWithTimeout('Closed disk project and switched to local project.');
      setPendingAction(undefined);
      return;
    }

    if (action.type === 'archive-project') {
      await setDiskProjectStatus(action.id, 'archived');
      setStatusMessageWithTimeout(`Archived project ${action.name}.`);
      setPendingAction(undefined);
      return;
    }

    if (action.type === 'delete-project') {
      await deleteDiskProject(action.id);
      setStatusMessageWithTimeout(`Deleted project ${action.name}.`);
      setPendingAction(undefined);
      return;
    }

    if (action.type === 'restore-version') {
      restoreProjectVersion(action.id);
      setStatusMessageWithTimeout(`Restored version ${action.name}.`);
      setPendingAction(undefined);
    }
  };

  const handleSaveProject = async () => {
    const result = await saveDiskProject();
    setStatusMessageWithTimeout(result.message);
  };

  const handleSaveVersion = () => {
    const nextVersionName = versionName.trim() || undefined;
    saveProjectVersion(nextVersionName);
    setVersionName('');
    setStatusMessageWithTimeout(nextVersionName
      ? `Saved version "${nextVersionName}".`
      : 'Saved a new version checkpoint.');
  };

  return (
    <div className="space-y-6">
      {onClose && (
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
          <span className="text-[12px] font-semibold text-slate-700">Projects</span>
          <button
            className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
            onClick={onClose}
          >
            ✕ Close
          </button>
        </div>
      )}
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Save &amp; Versions</div>
            <div className="text-[11px] text-slate-600">
              {dirty ? 'Unsaved changes.' : 'Synced.'}
            </div>
            <div className="text-[10px] text-slate-400" suppressHydrationWarning>
              Last synced: {diskLastSyncedAt ? new Date(diskLastSyncedAt).toLocaleString() : 'never'}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
              onClick={undoDocument}
            >
              Undo
            </button>
            <button
              className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
              onClick={redoDocument}
            >
              Redo
            </button>
            <input
              className="w-36 rounded border border-slate-200 px-2 py-1 text-[11px] outline-none focus:border-blue-400"
              value={versionName}
              onChange={(event) => setVersionName(event.target.value)}
              placeholder="Version name (optional)"
            />
            <button
              className="rounded bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800"
              onClick={handleSaveProject}
            >
              Save to disk
            </button>
            <button
              className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
              onClick={handleSaveVersion}
            >
              Save version
            </button>
          </div>
        </div>
      </div>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[13px] font-semibold text-slate-800">Project</h2>
            <div className="text-[11px] text-slate-500" suppressHydrationWarning>
              Created: {new Date(projectCreatedAt).toLocaleString()} · Rev: {revision} · {dirty ? 'Unsaved changes' : 'Saved'}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              Disk-backed (manual save required)
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${projectStatus === 'archived' ? 'bg-amber-100 text-amber-800' : projectStatus === 'closed' ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {projectStatus.toUpperCase()}
            </span>
            <button className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50" onClick={() => exportDiskProject()}>
              Export schema
            </button>
            <button className="rounded bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800" onClick={() => setActiveView('schema')}>
              Open Schema
            </button>
          </div>
        </div>

        {statusMessage ? <div className="mt-4 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">{statusMessage}</div> : null}
        {diskApiError ? (
          <div className="mt-4 flex items-center justify-between gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            <span>{diskApiError}</span>
            <button className="shrink-0 text-xs underline" onClick={clearDiskApiError}>Dismiss</button>
          </div>
        ) : null}

        {dirty ? (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            This working copy has unsaved changes. Save before loading or closing projects to avoid losing updates.
          </div>
        ) : null}

        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-400">Storage</div>
            <div className="mt-0.5 text-[12px] font-semibold text-slate-800">Disk</div>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-400">Catalog Projects</div>
            <div className="mt-0.5 text-[12px] font-semibold text-slate-800">{diskProjects.length}</div>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-400">Saved Versions</div>
            <div className="mt-0.5 text-[12px] font-semibold text-slate-800">{projectVersions.length}</div>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-400">Diagnostics</div>
            <div className="mt-0.5 text-[12px] font-semibold text-slate-800">{errorCount} errors · {warningCount} warnings</div>
          </div>
        </div>

        <div className="mt-3 rounded border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Project identity</div>
          <div className="flex items-center gap-2">
            {isRenaming ? (
              <>
                <input
                  className="input flex-1"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && renameValue.trim()) {
                      renameProject(renameValue.trim());
                      setIsRenaming(false);
                    }
                    if (e.key === 'Escape') {
                      setRenameValue(projectName);
                      setIsRenaming(false);
                    }
                  }}
                  autoFocus
                  placeholder="Project name"
                />
                <button
                  className="btn-primary"
                  disabled={!renameValue.trim()}
                  onClick={() => {
                    if (renameValue.trim()) {
                      renameProject(renameValue.trim());
                      setIsRenaming(false);
                    }
                  }}
                >
                  Rename
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setRenameValue(projectName);
                    setIsRenaming(false);
                  }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-[12px] font-medium text-slate-800">{projectName}</span>
                <button
                  className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                  onClick={() => {
                    setRenameValue(projectName);
                    setIsRenaming(true);
                  }}
                >
                  Rename
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mt-3 rounded border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Primary actions</div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
              onClick={() => importInputRef.current?.click()}
            >
              Import existing schema
            </button>
            <button
              className="rounded bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700"
              onClick={() => {
                setNewProjectModalName('');
                setIsNewProjectModalOpen(true);
              }}
            >
              New project
            </button>
            <button
              className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
              onClick={handleSaveProject}
            >
              Save to disk
            </button>
            <button
              className="rounded border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] text-red-600 hover:bg-red-100"
              onClick={() => setPendingAction({ type: 'close-current' })}
            >
              Close project
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  onImportFile(file);
                }
                event.target.value = '';
              }}
            />
          </div>
        </div>

        <div className="mt-2 text-[10px] text-slate-400">
          Disk projects are stored in workspace folder `.jsm-projects/` as portable JSON files.
        </div>
      </Panel>

      <Panel>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-semibold text-slate-800">Project Catalog</h3>
          <button className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50" onClick={() => refreshDiskProjects()}>
            Refresh list
          </button>
        </div>
        <div className="mt-2 space-y-1.5">
          {diskProjects.length === 0 ? (
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">No disk projects found.</div>
          ) : diskProjects.map((item) => {
            const owned = !item.ownerId || item.ownerId === currentUserId;
            return (
              <div key={item.id} className="grid gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-semibold text-slate-800">{item.name}</span>
                    {item.global && (
                      <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">Global</span>
                    )}
                    {!owned && !item.global && (
                      <span className="rounded-md bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">Shared with me</span>
                    )}
                    {owned && !item.global && (item.sharedWith?.length ?? 0) > 0 && (
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        Shared with {item.sharedWith!.length}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500" suppressHydrationWarning>
                    {item.status} · rev {item.revision} · {new Date(item.updatedAt).toLocaleString()}
                    {!owned && <span className="ml-1.5 text-slate-400">(read-only)</span>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                    onClick={async () => {
                      await loadDiskProject(item.id);
                      setStatusMessageWithTimeout(`Loaded project ${item.name}.`);
                      onClose?.();
                    }}
                  >
                    {diskProjectId === item.id && projectStatus === 'open' ? 'Loaded' : 'Load'}
                  </button>
                  <button
                    className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                    onClick={() => exportDiskProject(item.id)}
                  >
                    Export
                  </button>
                  {owned && (
                    <button
                      className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                      onClick={() => {
                        setShareMode('everyone');
                        setShareEmail('');
                        setShareEmailResult(undefined);
                        setShareModalProjectId(item.id);
                      }}
                    >
                      Share
                    </button>
                  )}
                  {item.status === 'archived' ? (
                    <button
                      className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                      onClick={async () => {
                        await setDiskProjectStatus(item.id, 'open');
                        setStatusMessageWithTimeout(`Restored project ${item.name}.`);
                      }}
                    >
                      Restore
                    </button>
                  ) : (
                    <button
                      className="rounded border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] text-amber-700 hover:bg-amber-100"
                      onClick={() => setPendingAction({ type: 'archive-project', id: item.id, name: item.name })}
                    >
                      Archive
                    </button>
                  )}
                  {owned && (
                    <button
                      className="rounded border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] text-red-600 hover:bg-red-100"
                      onClick={() => setPendingAction({ type: 'delete-project', id: item.id, name: item.name })}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-semibold text-slate-800">Saved Versions</h3>
          <div className="flex items-center gap-1.5">
            <input
              className="w-36 rounded border border-slate-200 px-2 py-1 text-[11px] outline-none focus:border-blue-400"
              value={versionName}
              onChange={(event) => setVersionName(event.target.value)}
              placeholder="Version name (optional)"
            />
            <button
              className="rounded bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800"
              onClick={handleSaveVersion}
            >
              Save version
            </button>
          </div>
        </div>
        <div className="mt-2 space-y-1.5">
          {projectVersions.length === 0 ? (
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">No versions yet.</div>
          ) : projectVersions.map((version) => (
            <div key={version.id} className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2">
              <div>
                <div className="text-[12px] font-semibold text-slate-800">{version.name}</div>
                <div className="text-[10px] text-slate-500" suppressHydrationWarning>{new Date(version.createdAt).toLocaleString()}</div>
              </div>
              <button
                className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                onClick={() => setPendingAction({ type: 'restore-version', id: version.id, name: version.name })}
              >
                Restore
              </button>
            </div>
          ))}
        </div>
      </Panel>

      {/* ── Environments ── */}
      {diskProjectId && (
        <Panel>
          <button
            className="flex w-full items-center justify-between"
            onClick={() => setShowEnvs((v) => !v)}
          >
            <h3 className="text-[13px] font-semibold text-slate-800">
              Environments{environments.length > 0 ? ` (${environments.length})` : ''}
            </h3>
            <span className="text-[10px] text-slate-400">{showEnvs ? '▲' : '▼'}</span>
          </button>
          {showEnvs && (
            <div className="mt-3 space-y-2">
              <p className="text-[11px] text-slate-500">
                Define named push targets (import token per environment). Used by the &ldquo;Push to Environment&rdquo; tool.
              </p>

              {/* Existing environments */}
              {environments.map((env) => (
                <div key={env.id} className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                  {editingEnvId === env.id ? (
                    <div className="space-y-1.5">
                      <input
                        className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px] outline-none focus:border-blue-400"
                        placeholder="Name"
                        value={editEnvName}
                        onChange={(e) => setEditEnvName(e.target.value)}
                      />
                      <input
                        className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-mono outline-none focus:border-blue-400"
                        placeholder="New token (leave blank to keep existing)"
                        type="password"
                        value={editEnvToken}
                        onChange={(e) => setEditEnvToken(e.target.value)}
                      />
                      <div className="flex gap-1.5">
                        <button
                          className="rounded bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800"
                          onClick={() => {
                            if (editEnvName.trim()) {
                              updateEnvironment(env.id, {
                                name: editEnvName,
                                ...(editEnvToken.trim() ? { token: editEnvToken.trim() } : {}),
                              });
                            }
                            setEditingEnvId(null);
                          }}
                        >
                          Save
                        </button>
                        <button
                          className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                          onClick={() => setEditingEnvId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[12px] font-semibold text-slate-800">{env.name}</div>
                        <div className="font-mono text-[10px] text-slate-400">
                          {env.token ? `${env.token.slice(0, 6)}••••••••••${env.token.slice(-10)}` : '(no token)'}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                          onClick={() => {
                            setEditingEnvId(env.id);
                            setEditEnvName(env.name);
                            setEditEnvToken('');
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="rounded border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] text-red-700 hover:bg-red-100"
                          onClick={() => removeEnvironment(env.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Add new environment form */}
              <div className="rounded border border-dashed border-slate-300 px-3 py-2 space-y-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Add Environment</div>
                <input
                  className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px] outline-none focus:border-blue-400"
                  placeholder="Name (e.g. Production)"
                  value={newEnvName}
                  onChange={(e) => setNewEnvName(e.target.value)}
                />
                <input
                  className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-mono outline-none focus:border-blue-400"
                  placeholder="Bearer token"
                  type="password"
                  value={newEnvToken}
                  onChange={(e) => setNewEnvToken(e.target.value)}
                />
                <button
                  className="rounded bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  disabled={!newEnvName.trim() || !newEnvToken.trim()}
                  onClick={() => {
                    addEnvironment({ name: newEnvName, token: newEnvToken });
                    setNewEnvName('');
                    setNewEnvToken('');
                  }}
                >
                  Add
                </button>
              </div>
              <p className="text-[10px] text-slate-400">
                Environments are saved with the project and follow the same sharing/access rules.
                Save the project to disk after making changes.
              </p>
            </div>
          )}
        </Panel>
      )}

      <Panel>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-semibold text-slate-800">Compare Versions</h3>
          <button className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50" onClick={() => setActiveView('diff')}>
            Open Diff View
          </button>
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <select
            className="rounded border border-slate-200 px-2 py-1 text-[11px] outline-none focus:border-blue-400"
            value={compareFrom}
            onChange={(event) => setCompareFrom(event.target.value)}
          >
            {compareOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
          <select
            className="rounded border border-slate-200 px-2 py-1 text-[11px] outline-none focus:border-blue-400"
            value={compareTo}
            onChange={(event) => setCompareTo(event.target.value)}
          >
            {compareOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </div>
        {!comparison ? (
          <div className="mt-2 text-[11px] text-slate-500">Select valid sources to compare.</div>
        ) : (
          <div className="mt-2 space-y-1.5 text-[11px]">
            <div className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-slate-700">
              Object types delta: {comparison.typeDelta >= 0 ? '+' : ''}{comparison.typeDelta} ·
              Mappings delta: {comparison.mappingDelta >= 0 ? '+' : ''}{comparison.mappingDelta}
            </div>
            {comparison.impacts.length === 0 ? (
              <div className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-green-700">No breaking impact detected by current semantic checks.</div>
            ) : (
              comparison.impacts.map((impact) => (
                <div key={`${impact.code}-${impact.path}`} className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-red-700">
                  <div className="font-semibold">{impact.code}</div>
                  <div>{impact.message}</div>
                  <div className="text-red-500">{impact.path}</div>
                </div>
              ))
            )}
          </div>
        )}
      </Panel>

      <Panel>
        <h3 className="text-[13px] font-semibold text-slate-800">Activity</h3>
        <div className="mt-2 max-h-64 space-y-1.5 overflow-auto">
          {projectActivity.length === 0 ? (
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">No project activity yet.</div>
          ) : projectActivity.map((item) => (
            <div key={item.id} className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-[11px] font-semibold text-slate-700">{item.action}</div>
              <div className="text-[11px] text-slate-600">{item.detail}</div>
              <div className="flex gap-2 text-[10px] text-slate-500" suppressHydrationWarning>
                <span>{new Date(item.at).toLocaleString()}</span>
                {item.by && <span className="text-slate-400">· {item.by}</span>}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {isNewProjectModalOpen && (
        <div
          className="fixed inset-0 z-[70] bg-slate-950/40 backdrop-blur-[2px] flex items-center justify-center"
          onClick={() => setIsNewProjectModalOpen(false)}
        >
          <div
            className="card max-w-md w-full p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-slate-900">Create Project</h2>
            <p className="mt-2 text-sm text-slate-600">Give your project a name to get started.</p>
            <div className="mt-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Project Name</label>
              <input
                className="input w-full"
                value={newProjectModalName}
                onChange={(e) => setNewProjectModalName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setIsNewProjectModalOpen(false);
                  if (e.key === 'Enter' && newProjectModalName.trim()) {
                    void createProjectFromScratch(newProjectModalName.trim());
                    setIsNewProjectModalOpen(false);
                  }
                }}
                placeholder="Enter a name..."
                autoFocus
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setIsNewProjectModalOpen(false)}>Cancel</button>
              <button
                className="btn-primary"
                disabled={!newProjectModalName.trim()}
                onClick={() => {
                  if (newProjectModalName.trim()) {
                    void createProjectFromScratch(newProjectModalName.trim());
                    setIsNewProjectModalOpen(false);
                  }
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {shareModalProjectId && (() => {
        const shareProject = diskProjects.find((p) => p.id === shareModalProjectId);
        const currentSharedWith = shareProject?.sharedWith ?? [];
        const isGlobal = shareProject?.global ?? false;
        return (
          <div
            className="fixed inset-0 z-[70] bg-slate-950/40 backdrop-blur-[2px] flex items-center justify-center"
            onClick={() => setShareModalProjectId(undefined)}
          >
            <div className="card max-w-md w-full p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-sm font-semibold text-slate-900">Manage Sharing</h2>

              {/* Current access section */}
              {(isGlobal || currentSharedWith.length > 0) && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Current access</p>
                  {isGlobal && (
                    <div className="flex items-center justify-between rounded-lg bg-blue-50 border border-blue-200 px-3 py-2">
                      <span className="text-sm text-blue-800">Everyone (global read-only)</span>
                      <button
                        className="text-xs text-red-600 hover:text-red-800 font-medium"
                        onClick={async () => {
                          await setDiskProjectGlobal(shareModalProjectId, false);
                          await refreshDiskProjects();
                          setStatusMessageWithTimeout('Removed global sharing.');
                        }}
                      >
                        Revoke
                      </button>
                    </div>
                  )}
                  {currentSharedWith.map((email) => (
                    <div key={email} className="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                      <span className="text-sm text-slate-800">{email}</span>
                      <button
                        className="text-xs text-red-600 hover:text-red-800 font-medium"
                        onClick={async () => {
                          await fetch(`/api/projects/${shareModalProjectId}`, {
                            method: 'PATCH',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify({ unshareWith: email }),
                          });
                          await refreshDiskProjects();
                          setStatusMessageWithTimeout(`Access revoked for ${email}.`);
                        }}
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add access section */}
              <div className="mt-4 space-y-3">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Add access</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="shareMode"
                    value="everyone"
                    checked={shareMode === 'everyone'}
                    onChange={() => { setShareMode('everyone'); setShareEmail(''); setShareEmailResult(undefined); }}
                  />
                  <span className="text-sm text-slate-700">Everyone (read-only)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="shareMode"
                    value="specific"
                    checked={shareMode === 'specific'}
                    onChange={() => setShareMode('specific')}
                  />
                  <span className="text-sm text-slate-700">Specific user by email</span>
                </label>
                {shareMode === 'specific' && (
                  <div className="ml-6">
                    <input
                      className="input w-full"
                      type="email"
                      placeholder="Enter email address"
                      value={shareEmail}
                      onChange={async (e) => {
                        const val = e.target.value;
                        setShareEmail(val);
                        setShareEmailResult(undefined);
                        if (val.includes('@') && val.includes('.')) {
                          setShareEmailChecking(true);
                          try {
                            const res = await fetch('/api/admin/share', {
                              method: 'POST',
                              headers: { 'content-type': 'application/json' },
                              body: JSON.stringify({ email: val }),
                            });
                            const data = await res.json() as { found: boolean; error?: string };
                            setShareEmailResult(data);
                          } finally {
                            setShareEmailChecking(false);
                          }
                        }
                      }}
                    />
                    {shareEmailChecking && (
                      <p className="mt-1 text-xs text-slate-500">Checking account...</p>
                    )}
                    {shareEmailResult && !shareEmailResult.found && (
                      <p className="mt-1 text-xs text-red-700 bg-red-100 rounded px-2 py-1">
                        {shareEmailResult.error ?? 'No account found for that email. Ask them to create an account first.'}
                      </p>
                    )}
                    {shareEmailResult?.found && (
                      <p className="mt-1 text-xs text-emerald-700">Account found.</p>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button className="btn-secondary" onClick={() => setShareModalProjectId(undefined)}>Close</button>
                <button
                  className="btn-primary"
                  disabled={shareMode === 'specific' && !shareEmailResult?.found}
                  onClick={async () => {
                    const id = shareModalProjectId;
                    if (!id) return;
                    if (shareMode === 'everyone') {
                      await setDiskProjectGlobal(id, true);
                      setStatusMessageWithTimeout('Project shared with everyone (read-only).');
                    } else if (shareEmailResult?.found && shareEmail) {
                      await fetch(`/api/projects/${id}`, {
                        method: 'PATCH',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ shareWith: shareEmail }),
                      });
                      setShareEmail('');
                      setShareEmailResult(undefined);
                      setStatusMessageWithTimeout(`Shared with ${shareEmail}.`);
                      await refreshDiskProjects();
                    }
                  }}
                >
                  Share
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <ConfirmModal
        open={Boolean(pendingAction)}
        title={pendingAction?.type === 'delete-project'
          ? 'Delete project'
          : pendingAction?.type === 'archive-project'
            ? 'Archive project'
            : pendingAction?.type === 'close-current'
              ? 'Close current project'
              : pendingAction?.type === 'restore-version'
                ? 'Restore saved version'
                : 'Confirm action'}
        description={pendingAction?.type === 'delete-project'
          ? `This permanently removes ${pendingAction.name} from disk.`
          : pendingAction?.type === 'archive-project'
            ? `Archive ${pendingAction.name}? You can restore it later.`
            : pendingAction?.type === 'close-current'
              ? 'Close the current project? Unsaved changes will be lost.'
              : pendingAction?.type === 'restore-version'
                ? `Restore ${pendingAction.name} into the current working copy?`
                : 'Proceed with this action?'}
        confirmLabel={pendingAction?.type === 'delete-project' ? 'Delete' : 'Confirm'}
        tone={pendingAction?.type === 'delete-project' ? 'danger' : 'default'}
        onCancel={() => setPendingAction(undefined)}
        onConfirm={confirmPendingAction}
      />
    </div>
  );
}
