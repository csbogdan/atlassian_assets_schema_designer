'use client';

import { useEffect, useRef, useState } from 'react';

type Section = {
  id: string;
  label: string;
};

const SECTIONS: Section[] = [
  { id: 'getting-started', label: 'Getting Started' },
  { id: 'projects', label: 'Projects' },
  { id: 'staged-deletions', label: 'Staged Deletions' },
  { id: 'schema-explorer', label: 'Schema Explorer' },
  { id: 'mapping-explorer', label: 'Mapping Explorer' },
  { id: 'validation', label: 'Validation' },
  { id: 'generator', label: 'Mapping Generator' },
  { id: 'diff', label: 'Diff & Changelog' },
  { id: 'tools', label: 'Tools' },
  { id: 'raw-json', label: 'Raw JSON Editor' },
  { id: 'settings', label: 'Settings' },
  { id: 'shortcuts', label: 'Keyboard Shortcuts' },
];

type Props = { open: boolean; onClose: () => void };

export function HelpPanel({ open, onClose }: Props) {
  const [activeSection, setActiveSection] = useState('getting-started');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const el = scrollRef.current?.querySelector(`#help-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] bg-slate-950/40 backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Help & documentation"
    >
      <div
        className="absolute right-0 top-0 h-full w-full max-w-4xl bg-white shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Help & Documentation</h2>
            <p className="text-xs text-slate-500 mt-0.5">JSM Assets Schema Designer — User Manual</p>
          </div>
          <button
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            onClick={onClose}
            aria-label="Close help panel"
          >
            ✕
          </button>
        </div>

        {/* Body: sidebar + content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <nav className="w-52 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50 py-3">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                onClick={() => scrollToSection(section.id)}
                className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                  activeSection === section.id
                    ? 'bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-500'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {section.label}
              </button>
            ))}
          </nav>

          {/* Content area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-8 py-6 text-sm text-slate-700">

            {/* ── Getting Started ──────────────────────────────────── */}
            <section id="help-getting-started" className="mb-10">
              <h2 className="text-lg font-semibold text-slate-900 mb-3">Getting Started</h2>
              <p className="mb-3 leading-relaxed">
                The JSM Assets Schema Designer is a visual designer for Atlassian JSM Assets external
                import schema-and-mapping JSON documents. It supports the full Atlassian external import
                workflow: editing your object schema and mapping definitions, validating them, comparing
                versions, and deploying to JSM.
              </p>
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 mb-4">
                This tool works with the Atlassian external import format — the same JSON structure consumed
                by the <code className="font-mono text-xs">PUT /importsource/&#123;id&#125;/mapping</code> endpoint.
              </div>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Workflow Overview</h3>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-700 leading-relaxed">
                <li>Create a project or load an existing one</li>
                <li>Import a schema-and-mapping document (paste JSON or pull from the JSM API)</li>
                <li>Explore and edit the schema and mappings</li>
                <li>Validate — fix errors and warnings before deploying</li>
                <li>Save a baseline snapshot before making changes</li>
                <li>Compare with diff to understand exactly what changed</li>
                <li>Push the mapping back to JSM when ready</li>
              </ol>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Document Structure</h3>
              <p className="leading-relaxed">
                A schema-and-mapping document has two top-level sections: <code className="font-mono text-xs bg-slate-100 px-1 rounded">schema</code> (which
                contains your <code className="font-mono text-xs bg-slate-100 px-1 rounded">objectSchema</code> and
                optional <code className="font-mono text-xs bg-slate-100 px-1 rounded">statusSchema</code>) and{' '}
                <code className="font-mono text-xs bg-slate-100 px-1 rounded">mapping</code> (which contains your
                list of <code className="font-mono text-xs bg-slate-100 px-1 rounded">objectTypeMappings</code>).
                Every field name is case-sensitive and must match the Atlassian specification exactly.
              </p>
            </section>

            {/* ── Projects ─────────────────────────────────────────── */}
            <section id="help-projects" className="mb-10">
              <h2 className="text-lg font-semibold text-slate-900 mb-3">Projects</h2>
              <p className="mb-3 leading-relaxed">
                Projects are named workspaces that store your document, versions, baselines, and activity log.
                Each project is saved to the server and isolated to your account by default.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Creating a Project</h3>
              <p className="leading-relaxed">
                Click the project name in the header to open the Projects panel, then click "New project".
                Give it a name. The project starts empty — import a document to begin working.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Loading a Project</h3>
              <p className="leading-relaxed">
                Open the Projects panel and click any project name to load it. The last loaded project is
                remembered between sessions.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Saving</h3>
              <p className="leading-relaxed">
                Use <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-xs">⌘S</kbd> or
                the Save button in the header. The header badge shows whether the project is saved, unsaved
                (dirty), or currently saving. Changes are also auto-saved after 8 seconds of inactivity.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Versions</h3>
              <p className="leading-relaxed">
                Save named point-in-time snapshots via{' '}
                <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-xs">⌘⇧S</kbd>.
                Versions appear in the Projects panel and can be restored at any time. Up to 30 versions are kept per project.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Baselines</h3>
              <p className="leading-relaxed">
                A baseline is a snapshot used as the comparison target in the Diff view. Save a baseline
                before starting a set of changes so you can see exactly what you changed. Up to 30 baselines
                are kept per project.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Sharing</h3>
              <p className="leading-relaxed mb-2">
                Projects are private by default. Owners can share via two mechanisms:
              </p>
              <ul className="space-y-1.5 list-disc list-inside text-slate-700 mb-2">
                <li><span className="font-medium">Global</span> — makes the project visible and readable by all users.</li>
                <li><span className="font-medium">Per-user</span> — grants read-only access to a specific user by email address.</li>
              </ul>
              <p className="leading-relaxed mb-2">
                Click the share icon on a project (or open <span className="font-medium">Manage Sharing</span> from the project panel)
                to add or remove access. Shared users can open and read the project, but only the owner can edit, save, or delete it.
              </p>
              <p className="leading-relaxed">
                The project list shows badges indicating sharing status:
              </p>
              <ul className="mt-1.5 space-y-1 list-disc list-inside text-slate-700">
                <li><span className="inline-flex items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">Global</span> — visible to all users</li>
                <li><span className="inline-flex items-center rounded-full bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-700">Shared with me</span> — you were granted access by the owner</li>
                <li><span className="inline-flex items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">Shared with N</span> — you own this project and have shared it with N specific users</li>
              </ul>
              <p className="mt-2 leading-relaxed">
                To revoke access, open <span className="font-medium">Manage Sharing</span> and click <span className="font-medium">Revoke</span> next to
                the user or the Global toggle.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Project Status</h3>
              <p className="leading-relaxed">
                Projects can be <span className="font-medium text-emerald-700">Open</span>,{' '}
                <span className="font-medium text-slate-600">Closed</span>, or{' '}
                <span className="font-medium text-amber-700">Archived</span>. Closed and archived projects
                are still accessible but are visually distinguished in the list.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Deleting</h3>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 mt-2">
                Only the project owner can delete a project. Deletion is permanent and cannot be undone.
              </div>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Activity Log</h3>
              <p className="leading-relaxed">
                The Projects panel shows a timestamped log of all actions taken on the project, including
                who made each change. This is useful for audit trails and team collaboration.
              </p>
            </section>

            {/* ── Staged Deletions ─────────────────────────────────── */}
            <section id="help-staged-deletions" className="mb-10">
              <h2 className="text-lg font-semibold text-slate-900 mb-3">Staged Deletions</h2>
              <p className="mb-3 leading-relaxed">
                Staged deletions let you mark object types for removal without immediately committing the change.
                Staged types are excluded from validation and exports so you can evaluate the impact before
                making anything permanent.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">How to Stage a Type</h3>
              <p className="leading-relaxed">
                Select an object type in the Schema Explorer tree, then click the amber{' '}
                <span className="font-medium">Stage</span> button in the detail panel. The type (and its
                entire child subtree) turns amber and is struck through in the tree. A footer banner appears
                at the bottom of the tree sidebar showing how many types are staged.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">What Staging Does</h3>
              <ul className="space-y-1.5 list-disc list-inside text-slate-700">
                <li>The staged type and all its children are excluded from validation runs.</li>
                <li>The staged types are excluded from exported JSON (via the export endpoint).</li>
                <li>
                  Cross-reference attributes in <em>other</em> types that point to a staged type are also
                  excluded, preventing dangling references in the exported schema.
                </li>
                <li>The change is reversible — nothing is permanently deleted until you commit.</li>
              </ul>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Restoring Staged Types</h3>
              <p className="leading-relaxed">
                To restore a single type, click the <span className="font-medium">Restore</span> button next
                to the type in the tree, or open its detail panel and click <span className="font-medium">Restore</span> from the amber banner.
                To restore all staged types at once, click <span className="font-medium">Restore all</span> in the footer.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Committing Staged Deletions</h3>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 mt-2 mb-2">
                Committing is permanent. The staged types are removed from the document and the action is
                pushed onto the undo stack, but the types cannot be restored after committing without using Undo.
              </div>
              <p className="leading-relaxed">
                Click <span className="font-medium">Commit</span> in the footer. A confirmation dialog
                shows exactly which types will be removed. Confirm to apply the deletion.
                Use <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-xs">⌘Z</kbd> immediately
                afterwards if you change your mind.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Persistence</h3>
              <p className="leading-relaxed">
                The staged list is saved with the project on disk. If you save the project while types are
                staged and reload it later, the staged state is restored — types will still be amber in the
                tree and excluded from exports.
              </p>
            </section>

            {/* ── Schema Explorer ──────────────────────────────────── */}
            <section id="help-schema-explorer" className="mb-10">
              <h2 className="text-lg font-semibold text-slate-900 mb-3">Schema Explorer</h2>
              <p className="mb-3 leading-relaxed">
                The Schema Explorer visualises your <code className="font-mono text-xs bg-slate-100 px-1 rounded">objectSchema</code> —
                the hierarchy of object types and their attributes.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Tree View</h3>
              <p className="leading-relaxed">
                The default view. Object types are listed with their attributes. Click a type to expand
                its details: attributes (with name, type, cardinality), inheritance path, mapping status,
                and cross-references to other types.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Graph View</h3>
              <p className="leading-relaxed">
                Toggle with the "Graph" button. Shows the type hierarchy visually using React Flow.
                Two renderers are available (Current / V11) — switch between them if one renders poorly
                for your schema size. Larger schemas may render faster with V11.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Reference Graph</h3>
              <p className="leading-relaxed">
                Shows which object types reference each other via{' '}
                <code className="font-mono text-xs bg-slate-100 px-1 rounded">referenced_object</code> attributes.
                Useful for understanding data relationships and dependency ordering before deployment.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Bulk Add Attributes</h3>
              <p className="leading-relaxed">
                Add the same attribute definition to multiple object types at once. Select the target
                types, define the attribute (name, type, cardinality), and click Add. Useful for adding
                common fields like "Source System" or "Environment" across many types simultaneously.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Attribute Usage</h3>
              <p className="leading-relaxed">
                Shows which attributes are covered by a mapping and which are unmapped. Helps identify
                gaps in your mapping coverage before validation.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Reading Attribute Details</h3>
              <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">Field</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="px-3 py-2 font-mono text-slate-800">type</td>
                      <td className="px-3 py-2 text-slate-600">
                        Atlassian attribute type: <code className="bg-slate-100 px-0.5 rounded">text</code>,{' '}
                        <code className="bg-slate-100 px-0.5 rounded">integer</code>,{' '}
                        <code className="bg-slate-100 px-0.5 rounded">boolean</code>,{' '}
                        <code className="bg-slate-100 px-0.5 rounded">date</code>,{' '}
                        <code className="bg-slate-100 px-0.5 rounded">email</code>,{' '}
                        <code className="bg-slate-100 px-0.5 rounded">url</code>,{' '}
                        <code className="bg-slate-100 px-0.5 rounded">referenced_object</code>,{' '}
                        <code className="bg-slate-100 px-0.5 rounded">select</code>,{' '}
                        <code className="bg-slate-100 px-0.5 rounded">ip_address</code>,{' '}
                        <code className="bg-slate-100 px-0.5 rounded">float</code>,{' '}
                        <code className="bg-slate-100 px-0.5 rounded">textarea</code>
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-mono text-slate-800">cardinality</td>
                      <td className="px-3 py-2 text-slate-600">
                        Min..max range. <code className="bg-slate-100 px-0.5 rounded">0..1</code> = optional
                        single value. <code className="bg-slate-100 px-0.5 rounded">0..*</code> = optional
                        multi-value. <code className="bg-slate-100 px-0.5 rounded">1..1</code> = required single.
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-mono text-slate-800">label</td>
                      <td className="px-3 py-2 text-slate-600">The attribute used as the object's display name. Each type must have exactly one label attribute.</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-mono text-slate-800">unique</td>
                      <td className="px-3 py-2 text-slate-600">Values must be unique across all objects of this type.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── Mapping Explorer ─────────────────────────────────── */}
            <section id="help-mapping-explorer" className="mb-10">
              <h2 className="text-lg font-semibold text-slate-900 mb-3">Mapping Explorer</h2>
              <p className="mb-3 leading-relaxed">
                The Mapping Explorer shows how your source data fields map onto schema attributes for each
                object type.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Structure</h3>
              <p className="leading-relaxed">
                Each <code className="font-mono text-xs bg-slate-100 px-1 rounded">objectTypeMapping</code> targets
                one object type. It defines:
              </p>
              <ul className="mt-2 space-y-1.5 list-disc list-inside text-slate-700">
                <li><span className="font-medium">Selector</span> — a JQL or CSV query that identifies source records for this type</li>
                <li><span className="font-medium">Unknown values policy</span> — what to do with values not in the schema: <code className="font-mono text-xs bg-slate-100 px-1 rounded">ADD</code> to create new entries or <code className="font-mono text-xs bg-slate-100 px-1 rounded">IGNORE</code> to skip them</li>
                <li><span className="font-medium">Attribute mappings</span> — how source fields map to each attribute</li>
              </ul>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Attribute Mapping Details</h3>
              <ul className="mt-2 space-y-1.5 list-disc list-inside text-slate-700">
                <li><span className="font-medium">Locators</span> — expressions pointing to source data fields. Multiple locators act as fallbacks tried left to right.</li>
                <li><span className="font-medium">externalIdPart</span> — marks attributes that contribute to the object's external ID. These values must be stable and unique across your source system.</li>
                <li><span className="font-medium">objectMappingIQL</span> — for <code className="font-mono text-xs bg-slate-100 px-1 rounded">referenced_object</code> attributes: a JQL expression that resolves a source value to an existing JSM Assets object.</li>
              </ul>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Coverage Tab</h3>
              <p className="leading-relaxed">
                Shows all attributes and how many are mapped. Unmapped required attributes (label attribute,
                attributes with minimum cardinality greater than zero) are highlighted in amber.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Dead Mappings</h3>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 mt-2">
                Mappings that reference object types not present in the schema are flagged as "dead". These
                will be rejected by JSM. Use the Validation view to find and remove them.
              </div>
            </section>

            {/* ── Validation ───────────────────────────────────────── */}
            <section id="help-validation" className="mb-10">
              <h2 className="text-lg font-semibold text-slate-900 mb-3">Validation</h2>
              <p className="mb-3 leading-relaxed">
                The Validation view runs five layers of checks against your document and presents all
                diagnostics in one place.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Validation Layers</h3>
              <div className="mt-2 space-y-2">
                {[
                  { n: '1', label: 'JSON Parse', desc: 'Is the document valid JSON? Syntax errors are caught here.' },
                  { n: '2', label: 'Shape', desc: 'Does it match the expected top-level structure and required keys?' },
                  { n: '3', label: 'Contract', desc: 'Required fields, case-sensitivity checks, Atlassian spec compliance.' },
                  { n: '4', label: 'Cross-reference', desc: 'Do all mapping references point to existing schema object type and attribute IDs?' },
                  { n: '5', label: 'Business rules', desc: 'Duplicate IDs, missing label attributes, cardinality issues, incomplete mappings.' },
                ].map(({ n, label, desc }) => (
                  <div key={n} className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-700">{n}</span>
                    <div>
                      <span className="font-medium text-slate-800">{label}</span>
                      <span className="text-slate-600"> — {desc}</span>
                    </div>
                  </div>
                ))}
              </div>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Severity Levels</h3>
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-red-500 shrink-0" />
                  <span><span className="font-medium text-red-700">Error</span> — will be rejected by JSM or cause import failure. Must be resolved before pushing.</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                  <span><span className="font-medium text-amber-700">Warning</span> — likely to cause problems or data quality issues. Strongly recommended to resolve.</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                  <span><span className="font-medium text-blue-700">Info</span> — suggestions and best practices. Safe to ignore.</span>
                </div>
              </div>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Quick Fixes</h3>
              <p className="leading-relaxed">
                Some diagnostics have a "Fix" button that applies the correction automatically. Safe fixes
                (such as trimming whitespace or adding missing fields with safe defaults) can be applied in
                bulk.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Disabled Rules</h3>
              <p className="leading-relaxed">
                Individual validation rule codes can be disabled in Settings → Validation Rules. The count
                of disabled rules is shown in the Validation view header as a reminder.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Jumping to Source</h3>
              <p className="leading-relaxed">
                Click any diagnostic to open the Raw JSON Editor with the cursor positioned at the offending
                field location.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Semantic Findings</h3>
              <p className="leading-relaxed">
                When a baseline is set, the Diff engine also contributes findings here — for example,
                breaking changes detected against the baseline are surfaced as diagnostics.
              </p>
            </section>

            {/* ── Mapping Generator ────────────────────────────────── */}
            <section id="help-generator" className="mb-10">
              <h2 className="text-lg font-semibold text-slate-900 mb-3">Mapping Generator</h2>
              <p className="mb-3 leading-relaxed">
                The Generator wizard helps you create new mappings for object types that exist in your
                schema but have not yet been mapped.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Step 1 — Select</h3>
              <p className="leading-relaxed">
                Choose an unmapped object type from the list. Only types with no existing
                <code className="font-mono text-xs bg-slate-100 px-1 rounded"> objectTypeMapping</code> entry are shown.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Step 2 — Configure</h3>
              <p className="leading-relaxed mb-2">
                Set the selector (the JQL or CSV query that pulls source records for this type). Then choose
                a generation strategy:
              </p>
              <ul className="space-y-1.5 list-disc list-inside text-slate-700">
                <li><span className="font-medium">Generate</span> — the wizard uses heuristics to suggest locators based on attribute names and types</li>
                <li><span className="font-medium">Clone</span> — copy the structure of an existing mapping as a starting point</li>
              </ul>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Preview</h3>
              <p className="leading-relaxed">
                Before committing, review the generated attribute mappings in the preview panel. You can
                edit locator expressions inline before adding.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Add</h3>
              <p className="leading-relaxed">
                Click Add to insert the new mapping into your document. It immediately appears in the
                Mapping Explorer and is included in subsequent validation runs.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Batch Generation</h3>
              <p className="leading-relaxed">
                You can repeat the process for multiple unmapped types without leaving the wizard. The list
                of unmapped types updates after each addition.
              </p>
            </section>

            {/* ── Diff & Changelog ─────────────────────────────────── */}
            <section id="help-diff" className="mb-10">
              <h2 className="text-lg font-semibold text-slate-900 mb-3">Diff & Changelog</h2>
              <p className="mb-3 leading-relaxed">
                The Diff view compares your current document against a saved baseline or version to show
                exactly what changed and classify those changes by impact.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Setting Up a Comparison</h3>
              <p className="leading-relaxed">
                Select a baseline or version from the left dropdown. The comparison is always between that
                snapshot on the left and your current working document on the right.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Semantic Diff Tab</h3>
              <p className="mb-2 leading-relaxed">Changes are classified as:</p>
              <div className="space-y-1.5">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 inline-block h-2 w-2 rounded-full bg-red-500 shrink-0" />
                  <span><span className="font-medium text-red-700">Breaking</span> — removed types, removed required attributes, attribute type changes. These will cause import failures or data loss.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 inline-block h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                  <span><span className="font-medium text-emerald-700">Safe</span> — additive changes (new types, new optional attributes). Safe to deploy without risk of data loss.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 inline-block h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                  <span><span className="font-medium text-blue-700">Info</span> — metadata changes, selector tweaks, policy updates. Low risk.</span>
                </div>
              </div>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Changelog Tab</h3>
              <p className="leading-relaxed">
                A human-readable narrative of all changes, suitable for sharing with stakeholders. Use
                "Copy as Markdown" to paste the summary into a ticket, PR description, or release note.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Saving a Baseline</h3>
              <p className="leading-relaxed">
                Click "Save baseline" before starting a set of changes and give it a meaningful name
                (e.g. "Before Q1 schema cleanup"). Baselines are stored with the project and persist
                across sessions.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Compare with Remote</h3>
              <p className="leading-relaxed">
                Fetches the live schema directly from Atlassian and compares it against your local document.
                In the Diff panel, expand the <em>Compare with Remote</em> section, select a configured
                environment (or enter a token manually), then click <em>Fetch remote &amp; compare</em>.
                The remote schema is loaded as a <strong>Remote (live)</strong> source option in both
                the left and right source dropdowns — use it on either side of the comparison.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Baselines vs Versions</h3>
              <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">Type</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">Purpose</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">When to use</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="px-3 py-2 font-medium text-slate-800">Baseline</td>
                      <td className="px-3 py-2 text-slate-600">Reference point for diff comparisons</td>
                      <td className="px-3 py-2 text-slate-600">Save one per change set, before starting work</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-medium text-slate-800">Version</td>
                      <td className="px-3 py-2 text-slate-600">Restore point you can roll back to</td>
                      <td className="px-3 py-2 text-slate-600">Save frequently, like commits</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── Tools ────────────────────────────────────────────── */}
            <section id="help-tools" className="mb-10">
              <h2 className="text-lg font-semibold text-slate-900 mb-3">Tools</h2>
              <p className="mb-3 leading-relaxed">
                The Tools panel provides operational utilities for integrating with the live JSM environment.
                Most tools require an Atlassian API token.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Import from JSM Assets</h3>
              <p className="leading-relaxed">
                Connect to the Atlassian API to pull a live schema-and-mapping document directly into the
                designer. Requires a Personal Access Token or API token from your Atlassian account settings.
                Paste your token, click Discover to find import sources in your workspaces, then Load to
                import the document.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Push Mapping to JSM</h3>
              <p className="mb-2 leading-relaxed">
                Deploy your current document back to JSM. Requires API token, workspace ID, and import
                source ID (auto-populated if you imported via the tool above).
              </p>
              <ul className="space-y-1.5 list-disc list-inside text-slate-700 mb-2">
                <li><span className="font-medium">PUT</span> — replaces the entire mapping. Use for full deployments.</li>
                <li><span className="font-medium">PATCH</span> — merges changes. Use for partial updates.</li>
              </ul>
              <p className="leading-relaxed">
                <span className="font-medium">Async mode</span> — for large schemas, async mode submits the job
                and polls for completion every 3 seconds. The config status indicator shows the current state:{' '}
                <code className="font-mono text-xs bg-slate-100 px-1 rounded">IDLE</code>,{' '}
                <code className="font-mono text-xs bg-slate-100 px-1 rounded">RUNNING</code>,{' '}
                <code className="font-mono text-xs bg-slate-100 px-1 rounded">DISABLED</code>, or{' '}
                <code className="font-mono text-xs bg-slate-100 px-1 rounded">MISSING_MAPPING</code>.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Export Schema with Icons</h3>
              <p className="leading-relaxed">
                Fetches the schema definition (including object type icons and colours) from the live
                Atlassian Assets API and exports it as JSON. Use Dry Run first to preview what would be
                exported. The result can be downloaded or imported directly into your current project.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Delete All Object Types</h3>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 my-2">
                Permanently deletes all object types from a live schema. Always run Dry Run first. Live
                deletion requires typing the schema ID to confirm. This cannot be undone.
              </div>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Replace GUIDs in Document</h3>
              <p className="leading-relaxed">
                Finds all <code className="font-mono text-xs bg-slate-100 px-1 rounded">cmdb::externalId</code> GUID
                values in the document and replaces them with human-readable names derived from the object
                type or attribute context. Use before sharing documents or to make diffs more readable.
                Click Analyze to preview replacements, then Apply to commit.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Export Documentation</h3>
              <p className="leading-relaxed mb-2">Downloads the schema in two formats:</p>
              <ul className="space-y-1 list-disc list-inside text-slate-700 mb-2">
                <li><span className="font-medium">Markdown</span> — one section per object type with a full attribute table. Inherited attributes are marked with <em>*(inherited)*</em>. Abstract/inheritance flags shown in metadata line.</li>
                <li><span className="font-medium">CSV</span> — one row per attribute, suitable for spreadsheet analysis or import into other tools.</li>
              </ul>
              <p className="leading-relaxed mb-1">Both exports include the full attribute definition:</p>
              <ul className="space-y-1 list-disc list-inside text-slate-600 text-xs">
                <li><code className="font-mono bg-slate-100 px-1 rounded">name</code>, <code className="font-mono bg-slate-100 px-1 rounded">externalId</code>, <code className="font-mono bg-slate-100 px-1 rounded">description</code></li>
                <li><code className="font-mono bg-slate-100 px-1 rounded">type</code>, <code className="font-mono bg-slate-100 px-1 rounded">minimumCardinality</code>, <code className="font-mono bg-slate-100 px-1 rounded">maximumCardinality</code></li>
                <li><code className="font-mono bg-slate-100 px-1 rounded">label</code>, <code className="font-mono bg-slate-100 px-1 rounded">unique</code></li>
                <li><code className="font-mono bg-slate-100 px-1 rounded">referenceObjectTypeName</code> / <code className="font-mono bg-slate-100 px-1 rounded">referenceObjectTypeExternalId</code> (for <code className="font-mono bg-slate-100 px-1 rounded">object</code> type attributes)</li>
                <li><code className="font-mono bg-slate-100 px-1 rounded">typeValues</code> (options for <code className="font-mono bg-slate-100 px-1 rounded">status</code> attributes; pipe-separated in CSV)</li>
                <li><code className="font-mono bg-slate-100 px-1 rounded">inherited</code> — whether the attribute is defined on a parent type</li>
              </ul>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Environments</h3>
              <p className="leading-relaxed mb-2">
                Named push targets, each with a Bearer token for an Atlassian import source. Configured in the
                Project panel sidebar or on the Settings page. Environments are stored in the project file and
                follow the same sharing rules — shared users can see them.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Push to Environment</h3>
              <p className="leading-relaxed">
                One-click deploy to a configured environment. Select an environment from the dropdown and click
                Push. The tool calls <code className="font-mono text-xs bg-slate-100 px-1 rounded">GET /imports/info</code> to
                discover the mapping URL, then issues a <code className="font-mono text-xs bg-slate-100 px-1 rounded">PATCH</code> with
                the current schema payload. Waits up to 2 minutes and shows a full log on completion or error.
              </p>
            </section>

            {/* ── Raw JSON Editor ──────────────────────────────────── */}
            <section id="help-raw-json" className="mb-10">
              <h2 className="text-lg font-semibold text-slate-900 mb-3">Raw JSON Editor</h2>
              <p className="mb-3 leading-relaxed">
                A full Monaco Editor instance for direct JSON editing with live validation.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Editor Features</h3>
              <ul className="space-y-1.5 list-disc list-inside text-slate-700">
                <li>Syntax highlighting and bracket pair colorization</li>
                <li>JSON Schema validation against the Atlassian import spec — invalid fields show red squiggles</li>
                <li>Auto-complete with <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-xs">Ctrl+Space</kbd> — suggests valid field names and values</li>
                <li>Inline diagnostics from the domain validators shown as squiggles with hover messages</li>
                <li>Minimap and indent guides for large documents</li>
              </ul>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Validate & Sync</h3>
              <p className="leading-relaxed">
                After editing raw JSON, click "Validate & Sync" (or enable Auto-validate) to parse the
                editor content and sync it back to app state. All other views — Schema Explorer, Mapping
                Explorer, Validation — update immediately.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Auto-validate</h3>
              <p className="leading-relaxed">
                When enabled, validation runs automatically 700ms after you stop typing. Useful for
                continuous feedback during rapid edits.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Export JSON</h3>
              <p className="leading-relaxed">
                Downloads the current document as a <code className="font-mono text-xs bg-slate-100 px-1 rounded">.json</code> file.
                The exported document preserves the optional <code className="font-mono text-xs bg-slate-100 px-1 rounded">$schema</code> property.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Export Diagnostics</h3>
              <p className="leading-relaxed">
                Downloads all current diagnostics as JSON. Useful for sharing issues with team members or
                filing bug reports.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Jumping from Diagnostics</h3>
              <p className="leading-relaxed">
                Click any diagnostic in the Validation view to open the Raw JSON Editor with the cursor
                positioned at the offending field location.
              </p>
            </section>

            {/* ── Settings ─────────────────────────────────────────── */}
            <section id="help-settings" className="mb-10">
              <h2 className="text-lg font-semibold text-slate-900 mb-3">Settings</h2>
              <p className="mb-3 leading-relaxed">
                Per-project configuration for API credentials and validation behaviour.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Atlassian Connection</h3>
              <p className="leading-relaxed mb-2">
                Store your API credentials with the project so you don't need to re-enter them each
                session. Fields:
              </p>
              <ul className="space-y-1 list-disc list-inside text-slate-700 mb-2">
                <li>Atlassian site URL (e.g. <code className="font-mono text-xs bg-slate-100 px-1 rounded">https://yoursite.atlassian.net</code>)</li>
                <li>Email address associated with your Atlassian account</li>
                <li>API token from Atlassian account settings</li>
                <li>Schema ID and import source ID</li>
              </ul>
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                Credentials are stored locally with the project. They are not sent anywhere except directly
                to the Atlassian API when you use the Tools panel.
              </div>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-1">Validation Rules</h3>
              <p className="leading-relaxed">
                Enable or disable individual validation rule codes. Rules are grouped by category (shape,
                contract, cross-reference, business rules). Disabled rules are skipped during validation
                and their diagnostics are hidden. The count of disabled rules is shown in the Validation
                view header as a reminder.
              </p>
            </section>

            {/* ── Keyboard Shortcuts ───────────────────────────────── */}
            <section id="help-shortcuts" className="mb-10">
              <h2 className="text-lg font-semibold text-slate-900 mb-3">Keyboard Shortcuts</h2>
              <p className="mb-4 leading-relaxed text-slate-600">
                Use these shortcuts to navigate and operate the app without reaching for the mouse.
              </p>

              <h3 className="text-sm font-semibold text-slate-800 mb-2">File Operations</h3>
              <div className="mb-4 grid gap-2 sm:grid-cols-2">
                <ShortcutRow keys={['⌘S', 'Ctrl+S']} label="Save project" />
                <ShortcutRow keys={['⌘⇧S', 'Ctrl+Shift+S']} label="Save named version" />
                <ShortcutRow keys={['⌘Z', 'Ctrl+Z']} label="Undo" />
                <ShortcutRow keys={['⌘⇧Z', 'Ctrl+Shift+Z']} label="Redo" />
                <ShortcutRow keys={['⌘Y', 'Ctrl+Y']} label="Redo (alternate)" />
              </div>

              <h3 className="text-sm font-semibold text-slate-800 mb-2">Navigation (Go To mode)</h3>
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 mb-3">
                Press <kbd className="rounded border border-blue-300 bg-white px-1.5 py-0.5 font-mono text-xs">g</kbd> first
                to enter Go To mode (1.2s window), then press the destination key.
              </div>
              <div className="mb-4 grid gap-2 sm:grid-cols-2">
                <ShortcutRow keys={['g', 'd']} label="Go to Overview" separator="then" />
                <ShortcutRow keys={['g', 's']} label="Go to Schema Explorer" separator="then" />
                <ShortcutRow keys={['g', 'm']} label="Go to Mapping Explorer" separator="then" />
                <ShortcutRow keys={['g', 'v']} label="Go to Validation" separator="then" />
                <ShortcutRow keys={['g', 'g']} label="Go to Generator" separator="then" />
                <ShortcutRow keys={['g', 'f']} label="Go to Diff" separator="then" />
                <ShortcutRow keys={['g', 'r']} label="Go to Raw JSON" separator="then" />
                <ShortcutRow keys={['g', 'p']} label="Go to Projects" separator="then" />
              </div>

              <h3 className="text-sm font-semibold text-slate-800 mb-2">Interface</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                <ShortcutRow keys={['⌘K', 'Ctrl+K']} label="Open command palette" />
                <ShortcutRow keys={['?']} label="Open this help panel" />
                <ShortcutRow keys={['Esc']} label="Close overlays / cancel" />
              </div>

              <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-2">Raw JSON Editor (Monaco)</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                <ShortcutRow keys={['Ctrl+Space']} label="Trigger auto-complete" />
                <ShortcutRow keys={['⌘/']} label="Toggle line comment" />
                <ShortcutRow keys={['⌥⇧F']} label="Format document" />
                <ShortcutRow keys={['⌘F']} label="Find in editor" />
              </div>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}

function ShortcutRow({
  keys,
  label,
  separator = '/',
}: {
  keys: string[];
  label: string;
  separator?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="text-sm text-slate-700">{label}</span>
      <span className="flex items-center gap-1 shrink-0">
        {keys.map((key, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && (
              <span className="text-xs text-slate-400">{separator}</span>
            )}
            <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">
              {key}
            </kbd>
          </span>
        ))}
      </span>
    </div>
  );
}
