'use client';

import { useEffect, useRef, useState } from 'react';
import { useDocumentStore } from '@/stores/documentStore';
import { buildGuidMappings, applyGuidMappings, type GuidMapping } from '@/domain/transformers/guidReplacer';
import { exportToMarkdown } from '@/domain/transformers/exportMarkdown';
import { exportToCsv } from '@/domain/transformers/exportCsv';
import type { ConfigStatus, ProgressResult } from '@/domain/api/assetsImportSourceApi';
import type { AssetsImportDocument, ProjectSettings } from '@/domain/model/types';

import type { ProjectEnvironment } from '@/domain/model/types';
import { LLM_MODELS, type LLMModel, type LLMFinding, type LLMReviewResult } from '@/domain/llm/reviewPrompt';

type ToolSection = 'import-jsm' | 'push-mapping' | 'export-schema' | 'delete-types' | 'replace-guids' | 'export-docs' | 'push-to-env' | 'sync-icons' | 'ai-review';

export function ToolsPanel() {
  const [expanded, setExpanded] = useState<ToolSection | null>('import-jsm');
  const projectSettings = useDocumentStore((state) => state.projectSettings);
  const document = useDocumentStore((state) => state.document);
  const loadDocument = useDocumentStore((state) => state.loadDocument);
  const createDiskProject = useDocumentStore((state) => state.createDiskProject);
  const updateDocument = useDocumentStore((state) => state.updateDocument);
  const environments = useDocumentStore((state) => state.environments);

  const toggle = (section: ToolSection) => setExpanded((prev) => prev === section ? null : section);

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Tools</h2>
        <p className="text-sm text-slate-500">Utilities that interact with live Atlassian Assets APIs or the current project document.</p>
      </div>

      <ImportFromJsmCard
        expanded={expanded === 'import-jsm'}
        onToggle={() => toggle('import-jsm')}
        defaultToken={projectSettings.atlassianApiToken ?? ''}
        loadDocument={loadDocument}
        createDiskProject={createDiskProject}
      />

      <PushMappingCard
        expanded={expanded === 'push-mapping'}
        onToggle={() => toggle('push-mapping')}
        defaultToken={projectSettings.atlassianApiToken ?? ''}
        document={document}
      />

      <ExportSchemaCard
        expanded={expanded === 'export-schema'}
        onToggle={() => toggle('export-schema')}
        defaults={projectSettings}
        loadDocument={loadDocument}
      />

      <DeleteObjectTypesCard
        expanded={expanded === 'delete-types'}
        onToggle={() => toggle('delete-types')}
        defaults={projectSettings}
      />

      <ReplaceGuidsCard
        expanded={expanded === 'replace-guids'}
        onToggle={() => toggle('replace-guids')}
        document={document}
        updateDocument={updateDocument}
      />

      <ExportDocsCard
        expanded={expanded === 'export-docs'}
        onToggle={() => toggle('export-docs')}
        document={document}
      />

      <PushToEnvCard
        expanded={expanded === 'push-to-env'}
        onToggle={() => toggle('push-to-env')}
        document={document}
        environments={environments}
      />

      <SyncIconsCard
        expanded={expanded === 'sync-icons'}
        onToggle={() => toggle('sync-icons')}
        defaults={projectSettings}
      />

      <AISchemaReviewCard
        expanded={expanded === 'ai-review'}
        onToggle={() => toggle('ai-review')}
        document={document}
      />
    </div>
  );
}

// ─── Shared UI helpers ────────────────────────────────────────────────────────

function Card({ title, subtitle, expanded, onToggle, children }: {
  title: string;
  subtitle: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="card overflow-hidden">
      <button
        className="flex w-full items-center justify-between px-5 py-3.5 text-left hover:bg-slate-50 transition-colors duration-100"
        onClick={onToggle}
      >
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <div className="text-xs text-slate-500">{subtitle}</div>
        </div>
        <span className="ml-4 shrink-0 text-slate-400 transition-transform duration-200" style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
      </button>
      {expanded && <div className="border-t border-slate-100 px-5 py-4">{children}</div>}
    </div>
  );
}

function LogOutput({ lines }: { lines: string[] }) {
  if (!lines.length) return null;
  return (
    <div className="mt-3 max-h-64 overflow-auto rounded-lg bg-slate-950 px-4 py-3 font-mono text-xs text-slate-300">
      {lines.map((line, i) => <div key={i}>{line}</div>)}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'input';

// ─── Tool 1: Import from JSM ─────────────────────────────────────────────────

type DiscoveredSource = {
  workspaceId: string;
  importSourceId: string;
  links?: Record<string, string>;
};

function ImportFromJsmCard({ expanded, onToggle, defaultToken, loadDocument, createDiskProject }: {
  expanded: boolean;
  onToggle: () => void;
  defaultToken: string;
  loadDocument: (input: string, options?: { markDirty?: boolean }) => void;
  createDiskProject: (name?: string, document?: AssetsImportDocument) => Promise<void>;
}) {
  const [token, setToken] = useState(defaultToken);
  const [loading, setLoading] = useState(false);
  const [fetchingSchema, setFetchingSchema] = useState(false);
  const [error, setError] = useState('');
  const [discovered, setDiscovered] = useState<DiscoveredSource | null>(null);
  const [rawResponse, setRawResponse] = useState<Record<string, unknown> | null>(null);
  const [loadedSchema, setLoadedSchema] = useState<{ document: AssetsImportDocument; importSourceId: string } | null>(null);

  const discoverSource = async () => {
    setLoading(true);
    setError('');
    setDiscovered(null);
    setRawResponse(null);
    setLoadedSchema(null);
    try {
      const r = await fetch('/api/tools/import-from-jsm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const data = await r.json() as {
        importSource?: DiscoveredSource;
        raw?: Record<string, unknown>;
        error?: string;
      };
      if (!r.ok || data.error) { setError(data.error ?? 'Discovery failed'); return; }
      if (data.importSource) {
        setDiscovered(data.importSource);
      } else if (data.raw) {
        setRawResponse(data.raw);
        setError('Could not extract workspace/import source IDs from the API response. See raw response below.');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadSchema = async (source: DiscoveredSource) => {
    setFetchingSchema(true);
    setError('');
    try {
      const r = await fetch('/api/tools/import-from-jsm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceId: source.workspaceId, importSourceId: source.importSourceId }),
      });
      const data = await r.json() as { schemaAndMapping?: AssetsImportDocument; error?: string };
      if (!r.ok || data.error) { setError(data.error ?? 'Failed to load schema'); return; }
      if (data.schemaAndMapping) {
        setLoadedSchema({ document: data.schemaAndMapping, importSourceId: source.importSourceId });
      }
    } finally {
      setFetchingSchema(false);
    }
  };

  return (
    <Card title="Import from JSM Assets" subtitle="Fetch a live schema-and-mapping from an Atlassian Assets import source" expanded={expanded} onToggle={onToggle}>
      <div className="space-y-3">
        <Field label="API Token (Bearer)">
          <input className={inputCls} type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ATATT3x..." />
        </Field>
        <button
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={loading || !token}
          onClick={() => void discoverSource()}
        >
          {loading ? 'Discovering...' : 'Discover Import Source'}
        </button>
        {error && <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        {discovered && !loadedSchema && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-sm font-semibold text-slate-800">Import source found</div>
            <div className="mt-1 space-y-0.5 font-mono text-xs text-slate-500">
              <div>Workspace ID: {discovered.workspaceId}</div>
              <div>Import Source ID: {discovered.importSourceId}</div>
            </div>
            {discovered.links && (
              <div className="mt-2 space-y-0.5 text-xs text-slate-400">
                {Object.entries(discovered.links).map(([key, url]) => (
                  <div key={key}><span className="font-medium">{key}:</span> {url}</div>
                ))}
              </div>
            )}
            <button
              className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={fetchingSchema}
              onClick={() => void loadSchema(discovered)}
            >
              {fetchingSchema ? 'Loading schema...' : 'Load Schema & Mapping'}
            </button>
          </div>
        )}

        {rawResponse && (
          <details className="text-xs">
            <summary className="cursor-pointer text-slate-500">Raw API response</summary>
            <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-slate-100 p-3 text-slate-600">{JSON.stringify(rawResponse, null, 2)}</pre>
          </details>
        )}

        {loadedSchema && (
          <div className="rounded-lg border border-green-300 bg-green-50 px-3 py-3">
            <div className="text-sm font-semibold text-green-800">Schema & mapping loaded</div>
            <div className="text-xs text-green-700">
              Object types: {loadedSchema.document.schema?.objectSchema?.objectTypes?.length ?? '?'} ·
              Mappings: {loadedSchema.document.mapping?.objectTypeMappings?.length ?? '?'} ·
              Source: {loadedSchema.importSourceId}
            </div>
            <div className="mt-2 flex gap-2">
              <button
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white"
                onClick={() => loadDocument(JSON.stringify(loadedSchema.document), { markDirty: true })}
              >
                Import into current project
              </button>
              <button
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium"
                onClick={() => void createDiskProject('Imported from JSM', loadedSchema.document)}
              >
                Create new project
              </button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Tool 2: Export Schema ────────────────────────────────────────────────────

function ExportSchemaCard({ expanded, onToggle, defaults, loadDocument }: {
  expanded: boolean;
  onToggle: () => void;
  defaults: ProjectSettings;
  loadDocument: (input: string, options?: { markDirty?: boolean }) => void;
}) {
  const [site, setSite] = useState(defaults.atlassianSite ?? '');
  const [email, setEmail] = useState(defaults.atlassianEmail ?? '');
  const [apiToken, setApiToken] = useState(defaults.atlassianApiToken ?? '');
  const [schemaId, setSchemaId] = useState(defaults.assetsSchemaId ?? '');
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [manifest, setManifest] = useState<Record<string, unknown> | null>(null);

  const run = async () => {
    setLoading(true);
    setLog([]);
    setManifest(null);
    try {
      const r = await fetch('/api/tools/export-schema', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ site, email, apiToken, schemaId, dryRun }),
      });
      const data = await r.json() as { log?: string[]; manifest?: Record<string, unknown>; error?: string };
      setLog(data.log ?? []);
      if (data.error) setLog((prev) => [...prev, `ERROR: ${data.error}`]);
      if (data.manifest) setManifest(data.manifest);
    } finally {
      setLoading(false);
    }
  };

  const downloadJson = () => {
    if (!manifest) return;
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `schema-export-${schemaId || 'unknown'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card title="Export Schema with Icons" subtitle="Fetch object type definitions and attributes from a live Atlassian Assets schema" expanded={expanded} onToggle={onToggle}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Site"><input className={inputCls} value={site} onChange={(e) => setSite(e.target.value)} placeholder="yourcompany.atlassian.net" /></Field>
          <Field label="Email"><input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" /></Field>
          <Field label="API Token"><input className={inputCls} type="password" value={apiToken} onChange={(e) => setApiToken(e.target.value)} placeholder="ATATT3x..." /></Field>
          <Field label="Schema ID"><input className={inputCls} value={schemaId} onChange={(e) => setSchemaId(e.target.value)} placeholder="27" /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          Dry run (plan only, no data fetched)
        </label>
        <button
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={loading || !site || !email || !apiToken || !schemaId}
          onClick={() => void run()}
        >
          {loading ? 'Running...' : 'Run Export'}
        </button>
        <LogOutput lines={log} />
        {manifest && (
          <div className="flex gap-2">
            <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white" onClick={downloadJson}>
              Download JSON
            </button>
            <button
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium"
              onClick={() => loadDocument(JSON.stringify(manifest), { markDirty: true })}
            >
              Import into current project
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Tool 3: Delete Object Types ──────────────────────────────────────────────

function DeleteObjectTypesCard({ expanded, onToggle, defaults }: {
  expanded: boolean;
  onToggle: () => void;
  defaults: ProjectSettings;
}) {
  const [site, setSite] = useState(defaults.atlassianSite ?? '');
  const [email, setEmail] = useState(defaults.atlassianEmail ?? '');
  const [apiToken, setApiToken] = useState(defaults.atlassianApiToken ?? '');
  const [schemaId, setSchemaId] = useState(defaults.assetsSchemaId ?? '');
  const [dryRun, setDryRun] = useState(true);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<{ deleted?: number; errors?: number; total?: number } | null>(null);

  const canRunLive = !dryRun && confirmText === schemaId;

  const run = async () => {
    if (!dryRun && !canRunLive) return;
    setLoading(true);
    setLog([]);
    setResult(null);
    try {
      const r = await fetch('/api/tools/delete-object-types', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ site, email, apiToken, schemaId, dryRun }),
      });
      const data = await r.json() as { log?: string[]; deleted?: number; errors?: number; total?: number; error?: string };
      setLog(data.log ?? []);
      if (data.error) setLog((prev) => [...prev, `ERROR: ${data.error}`]);
      setResult({ deleted: data.deleted, errors: data.errors, total: data.total });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="Delete All Object Types" subtitle="Permanently delete all object types in a schema (deepest children first)" expanded={expanded} onToggle={onToggle}>
      <div className="space-y-3">
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This permanently deletes ALL object types in the target schema. There is no undo. Always dry-run first.
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Site"><input className={inputCls} value={site} onChange={(e) => setSite(e.target.value)} placeholder="yourcompany.atlassian.net" /></Field>
          <Field label="Email"><input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" /></Field>
          <Field label="API Token"><input className={inputCls} type="password" value={apiToken} onChange={(e) => setApiToken(e.target.value)} placeholder="ATATT3x..." /></Field>
          <Field label="Schema ID"><input className={inputCls} value={schemaId} onChange={(e) => setSchemaId(e.target.value)} placeholder="27" /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input type="checkbox" checked={dryRun} onChange={(e) => { setDryRun(e.target.checked); setConfirmText(''); }} />
          Dry run (plan only, no deletions)
        </label>
        {!dryRun && (
          <div>
            <label className="mb-1 block text-xs font-medium text-red-600">
              Type the Schema ID (<code>{schemaId || '...'}</code>) to confirm live deletion:
            </label>
            <input
              className="w-full rounded-md border border-red-300 px-3 py-1.5 text-sm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={schemaId || 'schema ID'}
            />
          </div>
        )}
        <button
          className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${dryRun ? 'bg-slate-900' : 'bg-red-700 hover:bg-red-800'}`}
          disabled={loading || !site || !email || !apiToken || !schemaId || (!dryRun && !canRunLive)}
          onClick={() => void run()}
        >
          {loading ? 'Running...' : dryRun ? 'Run Dry Run' : 'DELETE (live)'}
        </button>
        <LogOutput lines={log} />
        {result && (
          <div className={`rounded-lg border px-3 py-2 text-sm ${(result.errors ?? 0) > 0 ? 'border-red-300 bg-red-50 text-red-800' : 'border-green-300 bg-green-50 text-green-800'}`}>
            {dryRun ? `Plan: ${result.total ?? 0} objects would be deleted.` : `Result: ${result.deleted ?? 0} deleted, ${result.errors ?? 0} errors of ${result.total ?? 0} total.`}
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Tool 5: Export Documentation ────────────────────────────────────────────

function ExportDocsCard({ expanded, onToggle, document }: {
  expanded: boolean;
  onToggle: () => void;
  document: AssetsImportDocument | undefined;
}) {
  const downloadBlob = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadMarkdown = () => {
    if (!document) return;
    downloadBlob(exportToMarkdown(document), 'schema-export.md', 'text/markdown');
  };

  const downloadCsv = () => {
    if (!document) return;
    downloadBlob(exportToCsv(document), 'schema-export.csv', 'text/csv');
  };

  return (
    <Card title="Export Documentation" subtitle="Download schema as Markdown or CSV for sharing with stakeholders." expanded={expanded} onToggle={onToggle}>
      <div className="space-y-3">
        {!document && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">No document loaded.</div>
        )}
        <div className="flex gap-2">
          <button
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={!document}
            onClick={downloadMarkdown}
          >
            Download Markdown (.md)
          </button>
          <button
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            disabled={!document}
            onClick={downloadCsv}
          >
            Download CSV (.csv)
          </button>
        </div>
      </div>
    </Card>
  );
}

// ─── Tool 4: Replace GUIDs ───────────────────────────────────────────────────

function ReplaceGuidsCard({ expanded, onToggle, document, updateDocument }: {
  expanded: boolean;
  onToggle: () => void;
  document: AssetsImportDocument | undefined;
  updateDocument: (updater: (doc: AssetsImportDocument) => AssetsImportDocument) => void;
}) {
  const [mappings, setMappings] = useState<GuidMapping[]>([]);
  const [analyzed, setAnalyzed] = useState(false);
  const [applied, setApplied] = useState(false);

  const analyze = () => {
    if (!document) return;
    const result = buildGuidMappings(document);
    setMappings(result);
    setAnalyzed(true);
    setApplied(false);
  };

  const apply = () => {
    if (!document || !mappings.length) return;
    updateDocument((doc) => applyGuidMappings(doc, mappings));
    setApplied(true);
  };

  return (
    <Card title="Replace GUIDs in Current Document" subtitle="Rewrite cmdb::externalId/UUID references with human-readable names" expanded={expanded} onToggle={onToggle}>
      <div className="space-y-3">
        {!document && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">No document loaded.</div>
        )}
        {document && (
          <>
            <button
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium"
              onClick={analyze}
            >
              Analyze GUIDs
            </button>
            {analyzed && mappings.length === 0 && (
              <div className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700">No GUIDs found — document is already using human-readable IDs.</div>
            )}
            {analyzed && mappings.length > 0 && (
              <>
                <div className="text-sm font-medium text-slate-700">{mappings.length} GUID(s) to replace:</div>
                <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-slate-600">Context</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-600">GUID (first 8)</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-600">Replacement</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mappings.map((m, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-3 py-1.5 text-slate-600">{m.context}</td>
                          <td className="px-3 py-1.5 font-mono text-slate-500">{m.guid.slice(0, 8)}...</td>
                          <td className="px-3 py-1.5 font-mono text-slate-800">{m.replacement}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!applied && (
                  <button
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                    onClick={apply}
                  >
                    Apply {mappings.length} Replacement{mappings.length !== 1 ? 's' : ''}
                  </button>
                )}
                {applied && (
                  <div className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700">
                    Applied {mappings.length} replacements to the current document.
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

// ─── Tool 6: Push Mapping to JSM ─────────────────────────────────────────────

type PushPhase = 'idle' | 'checking-status' | 'pushing' | 'polling' | 'done' | 'error';

const CONFIG_STATUS_LABELS: Record<ConfigStatus, string> = {
  IDLE: 'Idle — ready to accept a new mapping',
  DISABLED: 'Disabled — import source is disabled',
  MISSING_MAPPING: 'Missing mapping — no mapping configured yet',
  RUNNING: 'Running — import is currently in progress',
};

const CONFIG_STATUS_COLORS: Record<ConfigStatus, string> = {
  IDLE: 'text-green-700 bg-green-50 border-green-300',
  DISABLED: 'text-slate-600 bg-slate-100 border-slate-300',
  MISSING_MAPPING: 'text-amber-700 bg-amber-50 border-amber-300',
  RUNNING: 'text-blue-700 bg-blue-50 border-blue-300',
};

function PushMappingCard({
  expanded,
  onToggle,
  defaultToken,
  document,
}: {
  expanded: boolean;
  onToggle: () => void;
  defaultToken: string;
  document: AssetsImportDocument | undefined;
}) {
  const [token, setToken] = useState(defaultToken);
  const [workspaceId, setWorkspaceId] = useState('');
  const [importSourceId, setImportSourceId] = useState('');
  const [method, setMethod] = useState<'put' | 'patch'>('put');
  const [asyncMode, setAsyncMode] = useState(true);
  const [phase, setPhase] = useState<PushPhase>('idle');
  const [configStatus, setConfigStatus] = useState<ConfigStatus | null>(null);
  const [progress, setProgress] = useState<ProgressResult | null>(null);
  const [error, setError] = useState('');
  const [resourceId, setResourceId] = useState('');
  const pollTimerRef = useRef<number | undefined>(undefined);

  // Stop polling on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
    };
  }, []);

  const stopPolling = () => {
    if (pollTimerRef.current) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = undefined;
    }
  };

  const checkConfigStatus = async () => {
    if (!token || !workspaceId || !importSourceId) return;
    setPhase('checking-status');
    setError('');
    setConfigStatus(null);
    try {
      const params = new URLSearchParams({ token, workspaceId, importSourceId });
      const r = await fetch(`/api/tools/config-status?${params.toString()}`);
      const data = await r.json() as { status?: ConfigStatus; error?: string };
      if (!r.ok || data.error) { setError(data.error ?? 'Failed to fetch config status'); setPhase('error'); return; }
      setConfigStatus(data.status ?? 'IDLE');
      setPhase('idle');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  };

  const pollProgress = (rid: string) => {
    const poll = async () => {
      try {
        const params = new URLSearchParams({ token, workspaceId, importSourceId, resourceId: rid });
        const r = await fetch(`/api/tools/mapping-progress?${params.toString()}`);
        const data = await r.json() as ProgressResult & { error?: string };
        if (!r.ok || data.error) { setError(data.error ?? 'Progress poll failed'); setPhase('error'); return; }
        setProgress(data);
        if (data.status === 'DONE') {
          setPhase('done');
        } else if (data.status === 'FAILED') {
          setError(data.message ?? 'Async operation failed');
          setPhase('error');
        } else {
          pollTimerRef.current = window.setTimeout(() => { void poll(); }, 3000);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase('error');
      }
    };
    void poll();
  };

  const pushMapping = async () => {
    if (!document || !token || !workspaceId || !importSourceId) return;
    stopPolling();
    setPhase('pushing');
    setError('');
    setProgress(null);
    try {
      const r = await fetch('/api/tools/push-mapping', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, workspaceId, importSourceId, document, method, async: asyncMode }),
      });
      const data = await r.json() as { resourceId?: string; httpStatus?: number; error?: string };
      if (!r.ok || data.error) { setError(data.error ?? 'Push failed'); setPhase('error'); return; }
      if (asyncMode && data.resourceId) {
        setResourceId(data.resourceId);
        setPhase('polling');
        pollProgress(data.resourceId);
      } else {
        setPhase('done');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  };

  const reset = () => {
    stopPolling();
    setPhase('idle');
    setError('');
    setProgress(null);
    setResourceId('');
    setConfigStatus(null);
  };

  const isBusy = phase === 'checking-status' || phase === 'pushing' || phase === 'polling';

  return (
    <Card
      title="Push Mapping to JSM Assets"
      subtitle="PUT or PATCH the current mapping document back to an Atlassian Assets import source"
      expanded={expanded}
      onToggle={onToggle}
    >
      <div className="space-y-3">
        {!document && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            No document loaded. Open or import a project first.
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="API Token (Bearer)">
            <input className={inputCls} type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ATATT3x..." />
          </Field>
          <div />
          <Field label="Workspace ID">
            <input className={inputCls} value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
          </Field>
          <Field label="Import Source ID">
            <input className={inputCls} value={importSourceId} onChange={(e) => setImportSourceId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
          </Field>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" name="push-method" checked={method === 'put'} onChange={() => setMethod('put')} />
            PUT (replace full mapping)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" name="push-method" checked={method === 'patch'} onChange={() => setMethod('patch')} />
            PATCH (partial update)
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={asyncMode} onChange={(e) => setAsyncMode(e.target.checked)} />
          Async mode (poll for completion)
        </label>

        {/* Config status display */}
        {configStatus && (
          <div className={`rounded-lg border px-3 py-2 text-sm ${CONFIG_STATUS_COLORS[configStatus]}`}>
            Config status: <span className="font-semibold">{configStatus}</span> — {CONFIG_STATUS_LABELS[configStatus]}
          </div>
        )}

        {/* Progress display */}
        {phase === 'polling' && (
          <div className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-800">
            <div className="font-medium">Polling for completion… (resource: {resourceId})</div>
            {progress && (
              <div className="mt-1 text-xs text-blue-600">
                Status: {progress.status}
                {progress.progressPercentage !== undefined ? ` · ${progress.progressPercentage}%` : ''}
                {progress.message ? ` · ${progress.message}` : ''}
              </div>
            )}
          </div>
        )}

        {phase === 'done' && (
          <div className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700">
            Mapping pushed successfully.
            {progress?.progressPercentage !== undefined ? ` (${progress.progressPercentage}% complete)` : ''}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            disabled={isBusy || !token || !workspaceId || !importSourceId}
            onClick={() => void checkConfigStatus()}
          >
            {phase === 'checking-status' ? 'Checking…' : 'Check Config Status'}
          </button>
          <button
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={isBusy || !document || !token || !workspaceId || !importSourceId}
            onClick={() => void pushMapping()}
          >
            {phase === 'pushing' ? 'Pushing…' : `${method.toUpperCase()} Mapping`}
          </button>
          {(phase === 'done' || phase === 'error') && (
            <button
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium"
              onClick={reset}
            >
              Reset
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─── Tool 7: Push to Environment ─────────────────────────────────────────────

function PushToEnvCard({
  expanded,
  onToggle,
  document,
  environments,
}: {
  expanded: boolean;
  onToggle: () => void;
  document: AssetsImportDocument | undefined;
  environments: ProjectEnvironment[];
}) {
  const [selectedEnvId, setSelectedEnvId] = useState<string>('');
  const [log, setLog] = useState<string[]>([]);
  const [pushing, setPushing] = useState(false);
  const [result, setResult] = useState<'ok' | 'error' | null>(null);

  const selectedEnv = environments.find((e) => e.id === selectedEnvId) ?? environments[0] ?? null;

  const push = async () => {
    if (!document || !selectedEnv) return;
    setPushing(true);
    setLog([]);
    setResult(null);

    try {
      const r = await fetch('/api/tools/push-to-env', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: selectedEnv.token, document }),
      });

      const data = await r.json() as { ok?: boolean; error?: string; log?: string[]; response?: unknown };
      if (data.log) setLog(data.log);

      if (r.ok && data.ok) {
        setLog((prev) => [...(data.log ?? prev), `✓ Push to "${selectedEnv.name}" succeeded.`]);
        setResult('ok');
      } else {
        setLog((prev) => [...(data.log ?? prev), `✗ Error: ${data.error ?? 'Unknown error'}`]);
        setResult('error');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLog([`✗ Fetch error: ${msg}`]);
      setResult('error');
    } finally {
      setPushing(false);
    }
  };

  const noEnvs = environments.length === 0;

  return (
    <Card
      title="Push to Environment"
      subtitle="Push the current schema to a configured Atlassian import source environment."
      expanded={expanded}
      onToggle={onToggle}
    >
      <div className="space-y-3">
        {!document && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
            No document loaded.
          </div>
        )}
        {document && noEnvs && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            No environments configured. Add one in the Project panel under &ldquo;Environments&rdquo;.
          </div>
        )}
        {document && !noEnvs && (
          <>
            <Field label="Environment">
              <select
                className={inputCls}
                value={selectedEnvId || (environments[0]?.id ?? '')}
                onChange={(e) => setSelectedEnvId(e.target.value)}
              >
                {environments.map((env) => (
                  <option key={env.id} value={env.id}>{env.name}</option>
                ))}
              </select>
            </Field>
            <div className="text-xs text-slate-500">
              The schema will be pushed via <code className="font-mono">imports/info</code> → mapping URL. This may take up to 2 minutes.
            </div>
            <button
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-blue-700"
              disabled={pushing || !selectedEnv}
              onClick={push}
            >
              {pushing ? 'Pushing…' : `Push to "${selectedEnv?.name ?? '…'}"`}
            </button>
            {result === 'ok' && (
              <div className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700">
                Schema pushed successfully.
              </div>
            )}
            {result === 'error' && (
              <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                Push failed. See log below.
              </div>
            )}
            <LogOutput lines={log} />
          </>
        )}
      </div>
    </Card>
  );
}

// ─── Tool 9: AI Schema Review ─────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  naming: 'Naming',
  structure: 'Structure',
  mapping: 'Mapping',
  cardinality: 'Cardinality',
  'best-practice': 'Best Practice',
  performance: 'Performance',
  completeness: 'Completeness',
};

function scoreColorClass(score: number): string {
  if (score >= 85) return 'bg-green-100 text-green-800 border-green-300';
  if (score >= 70) return 'bg-amber-100 text-amber-700 border-amber-300';
  if (score >= 50) return 'bg-orange-100 text-orange-700 border-orange-300';
  return 'bg-red-100 text-red-700 border-red-300';
}

function LLMFindingCard({ finding }: { finding: LLMFinding }) {
  const sevClass =
    finding.severity === 'error'
      ? 'border-red-200 bg-red-50/50'
      : finding.severity === 'warning'
        ? 'border-amber-200 bg-amber-50/60'
        : 'border-sky-200 bg-sky-50/60';
  const sevBadge =
    finding.severity === 'error'
      ? 'bg-red-100 text-red-700'
      : finding.severity === 'warning'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-sky-100 text-sky-700';

  return (
    <div className={`rounded-md border p-3 ${sevClass}`}>
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${sevBadge}`}>
          {finding.severity}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
          {CATEGORY_LABELS[finding.category] ?? finding.category}
        </span>
        <span className="text-sm font-semibold text-slate-900">{finding.title}</span>
      </div>
      <p className="text-sm text-slate-700">{finding.description}</p>
      {finding.suggestion && (
        <div className="mt-1.5 rounded-md border border-slate-200 bg-white/80 px-2 py-1 text-xs text-slate-700">
          Suggestion: {finding.suggestion}
        </div>
      )}
      {finding.path && (
        <div className="mt-1 font-mono text-xs text-slate-400">{finding.path}</div>
      )}
    </div>
  );
}

function AISchemaReviewCard({ expanded, onToggle, document }: {
  expanded: boolean;
  onToggle: () => void;
  document: AssetsImportDocument | undefined;
}) {
  const [model, setModel] = useState<LLMModel>('gemini-flash');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LLMReviewResult | null>(null);
  const [error, setError] = useState('');

  const run = async () => {
    if (!document) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const r = await fetch('/api/tools/llm-review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ document, model }),
      });
      const data = await r.json() as LLMReviewResult & { error?: string };
      if (!r.ok || data.error) { setError(data.error ?? 'AI review failed'); return; }
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const errorCount = result?.recommendations.filter((f) => f.severity === 'error').length ?? 0;
  const warningCount = result?.recommendations.filter((f) => f.severity === 'warning').length ?? 0;
  const infoCount = result?.recommendations.filter((f) => f.severity === 'info').length ?? 0;

  return (
    <Card
      title="AI Schema Review"
      subtitle="Send the current schema to an LLM for quality analysis, gap detection, and prioritised recommendations"
      expanded={expanded}
      onToggle={onToggle}
    >
      <div className="space-y-3">
        {!document && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
            No document loaded. Open or import a project first.
          </div>
        )}

        {/* Model selector */}
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Model</div>
          <div className="flex flex-wrap gap-4">
            {(Object.entries(LLM_MODELS) as [LLMModel, (typeof LLM_MODELS)[LLMModel]][]).map(([key, cfg]) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="ai-review-model"
                  checked={model === key}
                  onChange={() => setModel(key)}
                />
                {cfg.label}
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cfg.badgeClass}`}>
                  {cfg.badge}
                </span>
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            Fast: quick scan, low cost · Deep: extended reasoning, 1M context · Expert: precise consultant-style analysis
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
            disabled={loading || !document}
            onClick={() => void run()}
          >
            {loading ? 'Analyzing…' : 'Run AI Review'}
          </button>
          {loading && (
            <span className="text-xs text-slate-400">10–30 s depending on schema size and model</span>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex flex-wrap items-start gap-3">
                {result.score !== null && (
                  <div className={`rounded-lg border px-4 py-2 text-center min-w-[72px] ${scoreColorClass(result.score)}`}>
                    <div className="text-2xl font-bold leading-none">{result.score}</div>
                    <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-70">Score</div>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700">{result.summary}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span>Model: <strong>{result.model}</strong></span>
                    <span>Mode: <strong>{result.mode}</strong></span>
                    <span>~{result.inputTokenEst.toLocaleString()} tokens</span>
                    {errorCount > 0 && <span className="font-semibold text-red-600">{errorCount} error{errorCount !== 1 ? 's' : ''}</span>}
                    {warningCount > 0 && <span className="font-semibold text-amber-600">{warningCount} warning{warningCount !== 1 ? 's' : ''}</span>}
                    {infoCount > 0 && <span className="text-sky-600">{infoCount} info</span>}
                  </div>
                </div>
              </div>
            </div>
            {result.recommendations.length > 0 ? (
              <div className="space-y-2">
                {result.recommendations.map((finding, i) => <LLMFindingCard key={i} finding={finding} />)}
              </div>
            ) : (
              <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                No recommendations — schema looks good.
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Tool 8: Sync Icons ───────────────────────────────────────────────────────

function SyncIconsCard({ expanded, onToggle, defaults }: {
  expanded: boolean;
  onToggle: () => void;
  defaults: ProjectSettings;
}) {
  const [srcSite, setSrcSite] = useState(defaults.atlassianSite ?? '');
  const [srcEmail, setSrcEmail] = useState(defaults.atlassianEmail ?? '');
  const [srcToken, setSrcToken] = useState('');
  const [srcSchemaId, setSrcSchemaId] = useState(defaults.assetsSchemaId ?? '');

  const [sameCredentials, setSameCredentials] = useState(true);
  const [dstSite, setDstSite] = useState('');
  const [dstEmail, setDstEmail] = useState('');
  const [dstToken, setDstToken] = useState('');
  const [dstSchemaId, setDstSchemaId] = useState('');

  const [ignoreCase, setIgnoreCase] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<{ updated?: number; errors?: number; total?: number; plannedCount?: number } | null>(null);

  const effectiveDstEmail = sameCredentials ? srcEmail : dstEmail;
  const effectiveDstToken = sameCredentials ? srcToken : dstToken;

  const canRunLive = !dryRun && confirmText === dstSchemaId;

  const run = async () => {
    if (!dryRun && !canRunLive) return;
    setLoading(true);
    setLog([]);
    setResult(null);
    try {
      const r = await fetch('/api/tools/sync-icons', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          srcSite, srcEmail, srcToken, srcSchemaId,
          dstSite,
          dstEmail: effectiveDstEmail,
          dstToken: effectiveDstToken,
          dstSchemaId,
          ignoreCase,
          dryRun,
        }),
      });
      const data = await r.json() as { log?: string[]; updated?: number; errors?: number; total?: number; plannedCount?: number; error?: string };
      setLog(data.log ?? []);
      if (data.error) setLog((prev) => [...prev, `ERROR: ${data.error}`]);
      setResult({ updated: data.updated, errors: data.errors, total: data.total, plannedCount: data.plannedCount });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      title="Sync Icons Between Schemas"
      subtitle="Copy object type icons from a source schema to a destination schema, matched by name."
      expanded={expanded}
      onToggle={onToggle}
    >
      <div className="space-y-4">
        {/* Source */}
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Source</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Site"><input className={inputCls} value={srcSite} onChange={(e) => setSrcSite(e.target.value)} placeholder="source.atlassian.net" /></Field>
            <Field label="Schema ID"><input className={inputCls} value={srcSchemaId} onChange={(e) => setSrcSchemaId(e.target.value)} placeholder="27" /></Field>
            <Field label="Email"><input className={inputCls} type="email" value={srcEmail} onChange={(e) => setSrcEmail(e.target.value)} placeholder="you@company.com" /></Field>
            <Field label="API Token"><input className={inputCls} type="password" value={srcToken} onChange={(e) => setSrcToken(e.target.value)} placeholder="ATATT3x..." /></Field>
          </div>
        </div>

        {/* Same credentials toggle */}
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input type="checkbox" checked={sameCredentials} onChange={(e) => setSameCredentials(e.target.checked)} />
          Use the same email &amp; token for destination
        </label>

        {/* Destination */}
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Destination</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Site"><input className={inputCls} value={dstSite} onChange={(e) => setDstSite(e.target.value)} placeholder="dest.atlassian.net" /></Field>
            <Field label="Schema ID"><input className={inputCls} value={dstSchemaId} onChange={(e) => { setDstSchemaId(e.target.value); setConfirmText(''); }} placeholder="42" /></Field>
            {!sameCredentials && (
              <>
                <Field label="Email"><input className={inputCls} type="email" value={dstEmail} onChange={(e) => setDstEmail(e.target.value)} placeholder="you@company.com" /></Field>
                <Field label="API Token"><input className={inputCls} type="password" value={dstToken} onChange={(e) => setDstToken(e.target.value)} placeholder="ATATT3x..." /></Field>
              </>
            )}
          </div>
        </div>

        {/* Options */}
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={ignoreCase} onChange={(e) => setIgnoreCase(e.target.checked)} />
            Match names case-insensitively
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={dryRun} onChange={(e) => { setDryRun(e.target.checked); setConfirmText(''); }} />
            Dry run (plan only, no changes)
          </label>
        </div>

        {!dryRun && (
          <div>
            <label className="mb-1 block text-xs font-medium text-amber-700">
              Type the destination Schema ID (<code>{dstSchemaId || '...'}</code>) to confirm live sync:
            </label>
            <input
              className="w-full rounded-md border border-amber-300 px-3 py-1.5 text-sm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={dstSchemaId || 'destination schema ID'}
            />
          </div>
        )}

        <button
          className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${dryRun ? 'bg-slate-900' : 'bg-blue-700 hover:bg-blue-800'}`}
          disabled={
            loading ||
            !srcSite || !srcEmail || !srcToken || !srcSchemaId ||
            !dstSite || !dstSchemaId ||
            (!sameCredentials && (!dstEmail || !dstToken)) ||
            (!dryRun && !canRunLive)
          }
          onClick={() => void run()}
        >
          {loading ? 'Running...' : dryRun ? 'Run Dry Run' : 'Sync Icons (live)'}
        </button>

        <LogOutput lines={log} />

        {result && (
          <div className={`rounded-lg border px-3 py-2 text-sm ${(result.errors ?? 0) > 0 ? 'border-red-300 bg-red-50 text-red-800' : 'border-green-300 bg-green-50 text-green-800'}`}>
            {dryRun
              ? `Plan: ${result.plannedCount ?? 0} icon(s) would be updated.`
              : `Result: ${result.updated ?? 0} updated, ${result.errors ?? 0} errors of ${result.total ?? 0} planned.`}
          </div>
        )}
      </div>
    </Card>
  );
}
