'use client';

import { useEffect, useState } from 'react';

// ── What's New convention ──────────────────────────────────────────────────
// Every time a feature or fix ships, add an entry to FEATURES[] and bump
// BANNER_KEY to the next version (v4 → v5 → …). Bumping the key forces the
// banner to reappear for all users who previously dismissed it.
// ──────────────────────────────────────────────────────────────────────────
const BANNER_KEY = 'whats-new-dismissed-v16';

type Feature = {
  icon: string;
  title: string;
  description: string;
};

const FEATURES: Feature[] = [
  {
    icon: '📸',
    title: 'Documentation refreshed with 14 new screenshots',
    description:
      'All documentation screenshots updated to reflect the current UI redesign. Covers login, projects, schema explorer, mapping explorer, validation, diff, tools, JSON editor, settings, graph views, project overview, sharing modal, and more.',
  },
  {
    icon: '🕸️',
    title: 'Docs now include graph view details',
    description:
      'The documentation now explains the Schema graph view more clearly and includes the dedicated graph screenshot so the visual topology workflow is covered properly.',
  },
  {
    icon: '🖼️',
    title: 'Docs now use the provided JASD logo',
    description:
      'The GitHub Pages documentation header now uses the supplied JASD PNG logo across the published pages instead of the placeholder text badge.',
  },
  {
    icon: '🔎',
    title: 'Docs screenshots now open in a zoom view',
    description:
      'Documentation screenshots now support a click-to-zoom overlay with a larger preview, caption, and Escape-to-close behavior.',
  },
  {
    icon: '📘',
    title: 'Docs expanded with fuller feature coverage',
    description:
      'The documentation site now describes the product in more detail, including overview, projects, schema, mapping, validation, generator, diff, tools, raw JSON, settings, environments, search, and shortcuts.',
  },
  {
    icon: '🧭',
    title: 'Docs site redesigned in Atlassian style',
    description:
      'The GitHub Pages documentation site now uses a cleaner Atlassian-style docs layout and includes fuller feature coverage across projects, schema, mapping, validation, diff, tools, settings, API, and pipeline pages.',
  },
  {
    icon: '📚',
    title: 'GitHub Pages documentation site',
    description:
      'New standalone HTML documentation site with modern navigation, architecture diagrams, API coverage, and a GitHub Actions pipeline for automatic Pages deployment.',
  },
  {
    icon: '🎨',
    title: 'Sync Icons Between Schemas',
    description:
      'New tool: copy object type icons from a source schema to a destination schema by matching names. Supports dry-run, case-insensitive matching, and an option to reuse the same credentials for both source and destination.',
  },
  {
    icon: '🛠️',
    title: 'Export documentation includes all fields',
    description:
      'CSV and Markdown exports now include all attribute fields: description, reference object type, reference external ID, and type options. Markdown also shows Abstract and Inheritance flags per object type.',
  },
  {
    icon: '💬',
    title: 'Header tooltips now visible',
    description: 'Tooltips on header buttons (Save, What\'s New, Keyboard Shortcuts) now appear below the button instead of above, fixing them being clipped at the top of the viewport.',
  },
  {
    icon: '⏱️',
    title: 'Status messages auto-dismiss',
    description: '"Project saved to disk." and other transient status messages now automatically disappear after 3 seconds.',
  },
  {
    icon: '🔄',
    title: 'Compare with Remote',
    description:
      'Diff panel now includes a "Compare with Remote" section — fetch the live schema from Atlassian and diff it against your local document. Select an environment or enter a token directly. The remote schema appears as a source option in both diff dropdowns.',
  },
  {
    icon: '⚙️',
    title: 'Environments now in Settings',
    description: 'Project environments (push targets) are now managed directly from the Settings panel, in addition to the Project panel sidebar.',
  },
  {
    icon: '🚀',
    title: 'Environments & Push to Environment',
    description:
      'Define named push environments (name + import token) per project. Use the new "Push to Environment" tool to push the current schema directly to an Atlassian import source via the imports/info → mapping URL flow.',
  },
  {
    icon: '🔴',
    title: 'Duplicate attribute name is now an error',
    description: 'Having two attributes with the same name in one object type is now flagged as an error instead of a warning.',
  },
  {
    icon: '💾',
    title: 'Shared projects are now writable',
    description: 'Users with explicit project access can now save changes, not just view them. Global projects remain read-only for non-owners.',
  },
  {
    icon: '🕐',
    title: 'Diff view auto-selects saved versions',
    description: 'Opening the Diff panel now automatically sets the left side to your most recent saved version, so you immediately see what changed.',
  },
  {
    icon: '✅',
    title: 'Duplicate attribute name validation',
    description: 'The validator now warns when an object type has two or more attributes sharing the same name.',
  },
  {
    icon: '🔧',
    title: 'Select type no longer accepts typeValues',
    description: 'The attribute editor no longer shows the Options field for "select" type — typeValues is only supported on "status" attributes per the Atlassian spec.',
  },
  {
    icon: '🔑',
    title: 'Replace GUIDs avoids ID collisions',
    description: 'The GUID replacement tool now checks existing non-GUID IDs in the document before generating replacements, preventing duplicate externalId errors.',
  },
  {
    icon: '👥',
    title: 'Per-user sharing & revoke',
    description:
      'Share projects with specific users by email. Revoke access per-user or globally at any time from "Manage Sharing".',
  },
  {
    icon: '🗑️',
    title: 'Staged deletions',
    description:
      'Stage object types for deletion without committing immediately. Staged types are excluded from validation and exports — restore them any time, or commit to permanently remove them.',
  },
  {
    icon: '🏷️',
    title: 'Sharing badges',
    description:
      '"Shared with me", "Global", and "Shared with N" badges now appear in the project list so you can see at a glance how each project is accessed.',
  },
  {
    icon: '🔍',
    title: 'Global duplicate attribute ID validation',
    description:
      'The validator now catches duplicate attribute externalIds across the entire schema — not just within a single type. Reusing the same externalId in multiple object types causes a backend key violation in Atlassian.',
  },
  {
    icon: '🔒',
    title: 'Project visibility fixed',
    description:
      'Projects are now private by default. Only projects you own, or that have been explicitly shared with you (or set to Global), appear in your list.',
  },
  {
    icon: '🔎',
    title: 'Unmapped attribute visibility',
    description:
      'The mapping detail panel now shows a collapsible "Unmapped attributes" section listing every schema attribute that has no mapping entry yet — with a one-click "+ Add" button to create one.',
  },
  {
    icon: '📊',
    title: 'Coverage attribute breakdown',
    description:
      'Click any type in the Coverage tab to expand a full inline breakdown of mapped vs unmapped attributes — without leaving the coverage view. Use "View mapping →" to jump straight to the detail panel.',
  },
];

interface WhatsNewBannerProps {
  /** When true, show banner regardless of localStorage state */
  forceOpen?: boolean;
  onClose?: () => void;
}

export function WhatsNewBanner({ forceOpen, onClose }: WhatsNewBannerProps = {}) {
  const [visible, setVisible] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (forceOpen) {
      setVisible(true);
      return;
    }
    try {
      const dismissed = localStorage.getItem(BANNER_KEY);
      if (!dismissed) setVisible(true);
    } catch {
      // localStorage unavailable — stay hidden
    }
  }, [forceOpen]);

  function dismiss() {
    if (!forceOpen) {
      try {
        localStorage.setItem(BANNER_KEY, '1');
      } catch {
        // ignore
      }
    }
    setVisible(false);
    onClose?.();
  }

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[90] w-full max-w-sm rounded-xl border border-blue-200 bg-white shadow-2xl ring-1 ring-blue-100"
    >
      {/* Header */}
      <div className="flex items-center justify-between rounded-t-xl bg-blue-600 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base">✨</span>
          <span className="text-sm font-semibold text-white">What&apos;s New</span>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss what's new banner"
          className="rounded p-1 text-blue-200 hover:bg-blue-500 hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Feature list */}
      <ul className="divide-y divide-slate-100 px-4 py-2 max-h-[60vh] overflow-y-auto">
        {(showAll ? FEATURES : FEATURES.slice(0, 5)).map((f) => (
          <li key={f.title} className="flex gap-3 py-3">
            <span className="shrink-0 text-xl leading-none mt-0.5">{f.icon}</span>
            <div>
              <p className="text-sm font-medium text-slate-900">{f.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{f.description}</p>
            </div>
          </li>
        ))}
        {!showAll && FEATURES.length > 5 && (
          <li className="py-2">
            <button
              onClick={() => setShowAll(true)}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              + {FEATURES.length - 5} more
            </button>
          </li>
        )}
      </ul>

      {/* Footer */}
      <div className="rounded-b-xl border-t border-slate-100 px-4 py-3">
        <button
          onClick={dismiss}
          className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Got it — dismiss
        </button>
      </div>
    </div>
  );
}
