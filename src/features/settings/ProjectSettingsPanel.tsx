'use client';

import { useState } from 'react';
import { useDocumentStore } from '@/stores/documentStore';
import { ValidationSettings } from '@/features/settings/ValidationSettings';
import type { ProjectSettings } from '@/domain/model/types';

export function ProjectSettingsPanel() {
  const projectSettings = useDocumentStore((state) => state.projectSettings);
  const setProjectSettings = useDocumentStore((state) => state.setProjectSettings);
  const diskProjectId = useDocumentStore((state) => state.diskProjectId);
  const environments = useDocumentStore((state) => state.environments);
  const addEnvironment = useDocumentStore((state) => state.addEnvironment);
  const updateEnvironment = useDocumentStore((state) => state.updateEnvironment);
  const removeEnvironment = useDocumentStore((state) => state.removeEnvironment);

  const [newName, setNewName] = useState('');
  const [newToken, setNewToken] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editToken, setEditToken] = useState('');

  const handleChange = (key: keyof ProjectSettings, value: string) => {
    setProjectSettings({ [key]: value });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">Atlassian Connection</h2>
        <p className="mb-4 text-sm text-slate-500">
          Credentials used by Tools (Export, Delete, Import from JSM). Stored in the project file on disk.
          {!diskProjectId && (
            <span className="ml-1 font-medium text-amber-600">No disk project loaded — settings will not persist.</span>
          )}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Atlassian Site</label>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              placeholder="yourcompany.atlassian.net"
              value={projectSettings.atlassianSite ?? ''}
              onChange={(e) => handleChange('atlassianSite', e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              placeholder="you@company.com"
              type="email"
              value={projectSettings.atlassianEmail ?? ''}
              onChange={(e) => handleChange('atlassianEmail', e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">API Token</label>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm font-mono"
              placeholder="ATATT3xFfGF0..."
              type="password"
              value={projectSettings.atlassianApiToken ?? ''}
              onChange={(e) => handleChange('atlassianApiToken', e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Assets Schema ID</label>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              placeholder="27"
              value={projectSettings.assetsSchemaId ?? ''}
              onChange={(e) => handleChange('assetsSchemaId', e.target.value)}
            />
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          API token is stored in plain text in the local project file. Do not commit project files containing tokens to version control.
        </p>
      </div>

      <ValidationSettings />

      {/* ── Environments ── */}
      {diskProjectId && (
        <div className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Environments</h2>
          <p className="mb-4 text-sm text-slate-500">
            Named push targets with an import Bearer token. Used by &ldquo;Push to Environment&rdquo; and &ldquo;Compare with Remote&rdquo;.
          </p>

          <div className="space-y-2">
            {environments.map((env) => (
              <div key={env.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                {editId === env.id ? (
                  <div className="space-y-1.5">
                    <input
                      className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm"
                      placeholder="Name"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                    <input
                      className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm font-mono"
                      placeholder="New token (leave blank to keep existing)"
                      type="password"
                      value={editToken}
                      onChange={(e) => setEditToken(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button
                        className="rounded bg-slate-900 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                        disabled={!editName.trim()}
                        onClick={() => {
                          updateEnvironment(env.id, {
                            name: editName.trim(),
                            ...(editToken.trim() ? { token: editToken.trim() } : {}),
                          });
                          setEditId(null);
                        }}
                      >
                        Save
                      </button>
                      <button
                        className="rounded border border-slate-200 px-3 py-1 text-xs"
                        onClick={() => setEditId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="text-sm font-medium text-slate-800">{env.name}</span>
                      <span className="ml-2 font-mono text-xs text-slate-400">
                        {env.token.slice(0, 6)}••••••••••{env.token.slice(-10)}
                      </span>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs hover:bg-slate-50"
                        onClick={() => { setEditId(env.id); setEditName(env.name); setEditToken(''); }}
                      >
                        Edit
                      </button>
                      <button
                        className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700 hover:bg-red-100"
                        onClick={() => removeEnvironment(env.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Add new */}
            <div className="rounded-lg border border-dashed border-slate-300 px-3 py-3">
              <div className="mb-2 text-xs font-medium text-slate-600">Add environment</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  className="rounded border border-slate-200 px-2 py-1 text-sm"
                  placeholder="Name (e.g. Production)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <input
                  className="rounded border border-slate-200 px-2 py-1 text-sm font-mono"
                  placeholder="Bearer token"
                  type="password"
                  value={newToken}
                  onChange={(e) => setNewToken(e.target.value)}
                />
              </div>
              <button
                className="mt-2 rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                disabled={!newName.trim() || !newToken.trim()}
                onClick={() => {
                  addEnvironment({ name: newName.trim(), token: newToken.trim() });
                  setNewName('');
                  setNewToken('');
                }}
              >
                Add
              </button>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Tokens are stored in plain text in the project file. Do not commit project files containing tokens.
          </p>
        </div>
      )}
    </div>
  );
}
