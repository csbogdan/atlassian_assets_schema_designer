'use client';

import { useEffect, useMemo, useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useDocumentStore } from '@/stores/documentStore';
import { applyStaging } from '@/domain/transformers/stagingFilter';

// Severity map: domain → Monaco marker severity
const MONACO_SEVERITY: Record<string, number> = {
  error: 8,   // monaco.MarkerSeverity.Error
  warning: 4, // monaco.MarkerSeverity.Warning
  info: 2,    // monaco.MarkerSeverity.Info
};

export function RawJsonEditor() {
  const rawJson = useDocumentStore((state) => state.rawJson);
  const setRawJson = useDocumentStore((state) => state.setRawJson);
  const loadDocument = useDocumentStore((state) => state.loadDocument);
  const diagnostics = useDocumentStore((state) => state.diagnostics);
  const document = useDocumentStore((state) => state.document);
  const focusedPath = useDocumentStore((state) => state.focusedPath);
  const setFocusedPath = useDocumentStore((state) => state.setFocusedPath);
  const rawJsonParseError = useDocumentStore((state) => state.rawJsonParseError);
  const setRawJsonParseError = useDocumentStore((state) => state.setRawJsonParseError);
  const stagedForDeletion = useDocumentStore((state) => state.stagedForDeletion);

  const isStaging = stagedForDeletion.length > 0;
  const effectiveJson = useMemo(() => {
    if (!isStaging || !document) return rawJson;
    return JSON.stringify(applyStaging(document, stagedForDeletion), null, 2);
  }, [isStaging, document, stagedForDeletion, rawJson]);

  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const autoValidateRef = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── Mount ──────────────────────────────────────────────────────────────────
  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Register JSON schema so Monaco validates structure + offers completions
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      allowComments: false,
      schemas: [
        {
          uri: 'https://jsm-assets-schema-designer/schema',
          fileMatch: ['*'],
          schema: {
            type: 'object',
            required: ['schema', 'mapping'],
            properties: {
              $schema: { type: 'string' },
              schema: {
                type: 'object',
                required: ['objectSchema'],
                properties: {
                  objectSchema: {
                    type: 'object',
                    required: ['objectTypes'],
                    properties: {
                      name: { type: 'string' },
                      description: { type: 'string' },
                      objectTypes: {
                        type: 'array',
                        items: { $ref: '#/definitions/objectType' },
                      },
                    },
                  },
                  statusSchema: {
                    type: 'object',
                    properties: {
                      statuses: { type: 'array' },
                    },
                  },
                },
              },
              mapping: {
                type: 'object',
                required: ['objectTypeMappings'],
                properties: {
                  objectTypeMappings: {
                    type: 'array',
                    items: { $ref: '#/definitions/objectTypeMapping' },
                  },
                },
              },
            },
            definitions: {
              objectType: {
                type: 'object',
                required: ['externalId', 'name'],
                properties: {
                  externalId: { type: 'string', description: 'Unique identifier for this object type' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  iconKey: { type: 'string' },
                  inheritance: { type: 'boolean' },
                  attributes: { type: 'array', items: { $ref: '#/definitions/attribute' } },
                  children: { type: 'array', items: { $ref: '#/definitions/objectType' } },
                },
              },
              attribute: {
                type: 'object',
                required: ['externalId', 'name', 'type'],
                properties: {
                  externalId: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  type: {
                    type: 'string',
                    enum: [
                      'text', 'textarea', 'integer', 'double', 'boolean',
                      'date', 'time', 'date_time', 'email', 'url',
                      'status', 'referenced_object', 'select', 'ipaddress',
                    ],
                    description: 'Attribute value type',
                  },
                  label: { type: 'boolean' },
                  referenceObjectTypeExternalId: { type: 'string' },
                  referenceObjectTypeName: { type: 'string' },
                  typeValues: { type: 'array', items: { type: 'string' } },
                  minimumCardinality: { type: 'integer', minimum: 0 },
                  maximumCardinality: { type: 'integer', minimum: -1 },
                  unique: { type: 'boolean' },
                },
              },
              objectTypeMapping: {
                type: 'object',
                required: ['objectTypeExternalId', 'selector', 'attributesMapping'],
                properties: {
                  objectTypeExternalId: { type: 'string' },
                  objectTypeName: { type: 'string' },
                  selector: { type: 'string', description: 'JQL or CSV selector for source records' },
                  description: { type: 'string' },
                  unknownValues: {
                    type: 'string',
                    enum: ['IGNORE', 'WARN', 'ERROR'],
                  },
                  attributesMapping: {
                    type: 'array',
                    items: { $ref: '#/definitions/attributeMapping' },
                  },
                },
              },
              attributeMapping: {
                type: 'object',
                required: ['attributeExternalId'],
                properties: {
                  attributeExternalId: { type: 'string' },
                  attributeName: { type: 'string' },
                  attributeLocators: { type: 'array', items: { type: 'string' } },
                  externalIdPart: { type: 'boolean' },
                  objectMappingIQL: { type: 'string' },
                  valueMapping: { type: 'object', additionalProperties: { type: 'string' } },
                },
              },
            },
          },
        },
      ],
    });
  };

  // ── Sync domain diagnostics → Monaco markers ───────────────────────────────
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    const model = editor.getModel();
    if (!model) return;

    const source = model.getValue();
    const markers: Monaco.editor.IMarkerData[] = diagnostics.map((d) => {
      // Try to locate the JSON path in the source text
      const location = findTextRangeForJsonPointer(source, d.path);
      if (location) {
        const startPos = model.getPositionAt(location.start);
        const endPos = model.getPositionAt(location.end);
        return {
          severity: MONACO_SEVERITY[d.severity] ?? 4,
          message: `[${d.code}] ${d.message}${d.suggestion ? `\n💡 ${d.suggestion}` : ''}`,
          startLineNumber: startPos.lineNumber,
          startColumn: startPos.column,
          endLineNumber: endPos.lineNumber,
          endColumn: endPos.column,
          source: 'JSM Validator',
        };
      }
      // Fallback: mark line 1 column 1
      return {
        severity: MONACO_SEVERITY[d.severity] ?? 4,
        message: `[${d.code}] ${d.message}${d.suggestion ? `\n💡 ${d.suggestion}` : ''}`,
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 1,
        source: 'JSM Validator',
      };
    });

    monaco.editor.setModelMarkers(model, 'jsm-validator', markers);
  }, [diagnostics]);

  // ── Navigate to focusedPath ────────────────────────────────────────────────
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !focusedPath) return;

    const model = editor.getModel();
    if (!model) return;

    const source = model.getValue();
    const location = findTextRangeForJsonPointer(source, focusedPath);
    if (!location) return;

    const startPos = model.getPositionAt(location.start);
    const endPos = model.getPositionAt(location.end);

    editor.revealLineInCenter(startPos.lineNumber);
    editor.setSelection({
      startLineNumber: startPos.lineNumber,
      startColumn: startPos.column,
      endLineNumber: endPos.lineNumber,
      endColumn: endPos.column,
    });
    editor.focus();
  }, [focusedPath]);

  // ── Auto-validate on change ────────────────────────────────────────────────
  const handleChange = (value: string | undefined) => {
    const v = value ?? '';
    setRawJson(v);

    // Inline parse error tracking (immediate, no debounce)
    try {
      JSON.parse(v);
      setRawJsonParseError(undefined);
    } catch (err) {
      setRawJsonParseError(err instanceof Error ? err.message : 'Invalid JSON');
    }

    if (!autoValidateRef.current) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      loadDocument(v, { preserveRawJson: true });
    }, 300);
  };

  // ── Summary ────────────────────────────────────────────────────────────────
  const errorCount = useMemo(
    () => diagnostics.filter((d) => d.severity === 'error').length,
    [diagnostics],
  );
  const warningCount = useMemo(
    () => diagnostics.filter((d) => d.severity === 'warning').length,
    [diagnostics],
  );

  const exportJson = () => {
    const effective = document && stagedForDeletion.length > 0
      ? applyStaging(document, stagedForDeletion)
      : document;
    const payload = effective ? JSON.stringify(effective, null, 2) : rawJson;
    downloadText('assets-schema-document.json', payload);
  };

  const exportDiagnostics = () => {
    downloadText('assets-schema-diagnostics.json', JSON.stringify(diagnostics, null, 2));
  };

  return (
    <div className="card flex flex-col overflow-hidden" style={{ height: 'calc(100vh - 140px)', minHeight: 480 }}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-900">Raw JSON</span>
          {errorCount > 0 && (
            <span className="lozenge bg-red-100 text-red-700">{errorCount} error{errorCount !== 1 ? 's' : ''}</span>
          )}
          {warningCount > 0 && (
            <span className="lozenge bg-amber-100 text-amber-700">{warningCount} warning{warningCount !== 1 ? 's' : ''}</span>
          )}
          {errorCount === 0 && warningCount === 0 && (
            <span className="lozenge bg-emerald-100 text-emerald-700">Valid</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600 select-none">
            <input
              type="checkbox"
              defaultChecked
              onChange={(e) => {
                autoValidateRef.current = e.target.checked;
              }}
            />
            Auto-validate
          </label>
          <button className="btn-primary" onClick={() => loadDocument(rawJson)} disabled={isStaging} title={isStaging ? 'Commit or restore staged types to resume editing' : undefined}>
            Validate & Sync
          </button>
          <button className="btn-secondary" onClick={exportJson}>Export JSON</button>
          <button className="btn-secondary" onClick={exportDiagnostics}>Export diagnostics</button>
        </div>
      </div>

      {/* Focused path banner */}
      {focusedPath && (
        <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-900">
          <span>Navigated to: <code className="font-mono">{focusedPath}</code></span>
          <button className="btn-ghost text-amber-700" onClick={() => setFocusedPath(undefined)}>✕ Clear</button>
        </div>
      )}

      {/* Staged deletions banner */}
      {isStaging && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5">
          <span className="lozenge bg-amber-100 text-amber-700">{stagedForDeletion.length} staged</span>
          <span className="text-xs text-amber-800">Showing effective document — staged types excluded. Read-only while staging is active.</span>
        </div>
      )}

      {/* Parse error banner */}
      {rawJsonParseError && (
        <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-3 py-1.5">
          <span className="lozenge bg-red-100 text-red-700">Parse Error</span>
          <span className="text-xs text-red-700">Invalid JSON. Fix syntax and re-submit.</span>
        </div>
      )}

      {/* Monaco */}
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          defaultLanguage="json"
          value={effectiveJson}
          onChange={isStaging ? undefined : handleChange}
          onMount={handleMount}
          options={{
            readOnly: isStaging,
            fontSize: 13,
            fontFamily: '"Fira Code", "Cascadia Code", "JetBrains Mono", ui-monospace, monospace',
            fontLigatures: true,
            lineHeight: 20,
            tabSize: 2,
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            wordWrap: 'off',
            formatOnPaste: true,
            formatOnType: false,
            autoClosingBrackets: 'always',
            autoClosingQuotes: 'always',
            bracketPairColorization: { enabled: true },
            guides: { bracketPairs: true, indentation: true },
            renderLineHighlight: 'gutter',
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            padding: { top: 12, bottom: 12 },
            scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
            suggest: {
              showFields: true,
              showValues: true,
              showKeywords: true,
            },
            quickSuggestions: { other: true, comments: false, strings: true },
          }}
          theme="vs"
          loading={
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              Loading editor…
            </div>
          }
        />
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function downloadText(fileName: string, content: string) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = fileName;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function findTextRangeForJsonPointer(
  source: string,
  pointer: string,
): { start: number; end: number } | undefined {
  const segments = pointer
    .split('/')
    .slice(1)
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));

  if (segments.length === 0) return undefined;

  const keySegments = segments.filter((s) => Number.isNaN(Number(s)));
  if (keySegments.length === 0) return undefined;

  let bestStart = -1;
  let bestEnd = -1;
  let bestScore = -1;

  keySegments.forEach((key, keyIndex) => {
    const regex = new RegExp(`"${escapeRegExp(key)}"\\s*:`, 'g');
    let match = regex.exec(source);
    while (match) {
      const start = match.index;
      const end = start + match[0].length;
      let score = 0;
      for (let i = 0; i < keyIndex; i++) {
        const ancestor = keySegments[i];
        const ar = new RegExp(`"${escapeRegExp(ancestor)}"\\s*:`, 'g');
        let am = ar.exec(source);
        while (am) {
          if (am.index < start) score += 1;
          else break;
          am = ar.exec(source);
        }
      }
      if (score > bestScore || (score === bestScore && keyIndex > 0)) {
        bestStart = start;
        bestEnd = end;
        bestScore = score;
      }
      match = regex.exec(source);
    }
  });

  if (bestStart >= 0 && bestEnd > bestStart) return { start: bestStart, end: bestEnd };
  return undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
