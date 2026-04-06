# Roadmap

## UX Interaction Track (cross-phase priority)
- [x] Top tab bar navigation (Overview, Schema, Mapping, Validation, Generator, Diff, Tools, Raw JSON, Settings)
- [x] Tab-level sub-navigation within views (Tree/Graph, Explorer/Coverage)
- [x] Click-to-focus from diagnostics to target JSON path in Raw JSON editor
- [x] Contextual action bars with clear primary actions (Add, Edit, Delete, Generate, Validate, Export)
- [x] Dropdowns with sensible preselected defaults (unknownValues, object type selectors)
- [x] Dynamic dropdown options sourced from schema/mapping indexes (object types, attributes, referenced targets)
- [x] Keyboard shortcuts for navigation and common actions
- [x] Project switcher in top bar with slide-down panel
- [x] Monaco JSON editor with schema-aware completions and inline error squiggles

## Phase 0 — Foundation
- [x] Strict TypeScript project structure
- [x] Domain types and Zod schemas
- [x] JSON parser and normalizer
- [x] Sample fixture and unit tests
- [x] Initial UI scaffold

## Phase 1 — Read-only visualisation
- [x] Schema explorer (tree view)
- [x] Mapping explorer
- [x] Diagnostics / Validation console
- [x] Top-level app navigation shell
- [x] Graph view (hierarchy + reference graphs)
- [x] Search

## Phase 2 — Editing and consistency
- [x] Form-based object type and attribute editing
- [x] Mapping table editing
- [x] Inline row actions (edit, duplicate, remove)
- [x] Controlled selects with validation hints
- [x] Undo/redo
- [x] Autosave drafts
- [x] Consistent rename propagation

## Phase 3 — Breaking change analysis
- [x] Semantic diff with breaking/safe/info classification
- [x] Baseline snapshots
- [x] Safe autofixes
- [x] Impact report export
- [x] Changelog narrative

## Phase 4 — Mapping generation
- [x] Generator wizard UI
- [x] Step-by-step navigation (Back/Next/Review)
- [x] Heuristic locator suggestions
- [x] Clone existing mapping flow
- [x] Batch "Generate all unmapped" action

## Phase 5 — Robustness and scale
- [x] Web Worker-based off-thread validation
- [x] Large document benchmarks (120 object types)
- [x] Atlassian-compliant validation hardening (contract, business rules, cross-reference, impact analysis)
- [x] Configurable validation rules per project (Settings tab)

## Phase 6 — Atlassian API readiness
- [x] API service abstraction (`src/domain/api/assetsImportSourceApi.ts`)
- [x] Import from JSM (fetch schema-and-mapping via GET)
- [x] Push to JSM — PUT and PATCH support
- [x] Async progress polling (3s interval, resourceId tracking)
- [x] Config status display (IDLE / DISABLED / MISSING_MAPPING / RUNNING)
- [x] API routes: `config-status`, `mapping-progress`, `push-mapping`, `import-from-jsm`, `export-schema`, `delete-object-types`

## Phase 7 — Documentation and operations
- [x] README with feature overview and quick start
- [x] User guide with screenshots
- [x] Architecture and domain model docs
- [x] API reference
- [x] Deployment guide (Docker, Compose, nginx/Caddy)
- [x] Python scripts documentation
- [x] Validation rules reference
- [x] Dockerfile (multi-stage, Python venv, standalone Next.js)
- [x] `requirements.txt` for Python dependencies

## Backlog — Candidate improvements
- [ ] Explicit "Reload from disk" recovery flow after save conflict
- [ ] Project-level stale-copy warning when disk version is newer than loaded version
- [ ] Compare any two saved versions with full semantic diff output
- [ ] Project deletion safeguards (soft delete / recycle bin)
- [ ] Pulse animation on first diagnostic navigation to make target obvious in Schema/Mapping/Raw JSON
- [ ] Contributor git workflow guide (`feat|fix|chore|docs|test` conventions)
