'use client';

import { useMemo, useState } from 'react';
import { buildChangelogNarrative } from '@/domain/transformers/changelogNarrative';
import type { AssetsImportDocument } from '@/domain/model/types';

interface ChangelogPanelProps {
  leftDocument: AssetsImportDocument | undefined;
  rightDocument: AssetsImportDocument | undefined;
}

export function ChangelogPanel({ leftDocument, rightDocument }: ChangelogPanelProps) {
  const [copied, setCopied] = useState(false);

  const changelog = useMemo(() => {
    if (!leftDocument || !rightDocument) {
      return null;
    }
    return buildChangelogNarrative(leftDocument, rightDocument);
  }, [leftDocument, rightDocument]);

  if (!leftDocument || !rightDocument) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        Select two versions to compare.
      </div>
    );
  }

  const isEmpty =
    changelog !== null &&
    changelog.entries.length === 0 &&
    changelog.addedObjectTypes.length === 0 &&
    changelog.removedObjectTypes.length === 0;

  const copyAsMarkdown = async () => {
    if (!changelog) return;

    const lines: string[] = [];
    lines.push('## Summary');
    lines.push('');
    lines.push(changelog.summary);
    lines.push('');

    if (changelog.addedObjectTypes.length > 0) {
      lines.push('### Added Object Types');
      lines.push('');
      for (const id of changelog.addedObjectTypes) {
        lines.push(`- \`${id}\``);
      }
      lines.push('');
    }

    if (changelog.removedObjectTypes.length > 0) {
      lines.push('### Removed Object Types');
      lines.push('');
      for (const id of changelog.removedObjectTypes) {
        lines.push(`- \`${id}\``);
      }
      lines.push('');
    }

    for (const entry of changelog.entries) {
      lines.push(`### ${entry.objectTypeName} (${entry.objectTypeExternalId})`);
      lines.push('');
      for (const change of entry.changes) {
        lines.push(`- ${change}`);
      }
      lines.push('');
    }

    await navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      {changelog && (
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
            {changelog.summary}
          </span>
          <button
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
            onClick={copyAsMarkdown}
            disabled={isEmpty}
          >
            {copied ? 'Copied!' : 'Copy as Markdown'}
          </button>
        </div>
      )}

      {/* No changes */}
      {isEmpty && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          No changes detected between the selected versions.
        </div>
      )}

      {changelog && !isEmpty && (
        <>
          {/* Added object types */}
          {changelog.addedObjectTypes.length > 0 && (
            <div className="rounded-md border border-green-200 bg-green-50 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-green-700">
                Added object types
              </div>
              <div className="flex flex-wrap gap-1.5">
                {changelog.addedObjectTypes.map((id) => (
                  <span
                    key={id}
                    className="inline-flex items-center rounded bg-green-100 px-2 py-0.5 font-mono text-xs text-green-800"
                  >
                    {id}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Removed object types */}
          {changelog.removedObjectTypes.length > 0 && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">
                Removed object types
              </div>
              <div className="flex flex-wrap gap-1.5">
                {changelog.removedObjectTypes.map((id) => (
                  <span
                    key={id}
                    className="inline-flex items-center rounded bg-red-100 px-2 py-0.5 font-mono text-xs text-red-800"
                  >
                    {id}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Changed type cards */}
          {changelog.entries.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Changed types
              </div>
              {changelog.entries.map((entry) => (
                <div
                  key={entry.objectTypeExternalId}
                  className="rounded-md border border-slate-200 bg-white"
                >
                  <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
                    <span className="text-sm font-semibold text-slate-800">{entry.objectTypeName}</span>
                    <span className="font-mono text-xs text-slate-400">{entry.objectTypeExternalId}</span>
                  </div>
                  <ul className="space-y-1 px-3 py-2">
                    {entry.changes.map((change, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                        <span className="mt-0.5 shrink-0 text-slate-400">&#8226;</span>
                        <span>{change}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
