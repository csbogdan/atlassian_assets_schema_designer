import type { AssetsImportDocument, ObjectTypeDefinition } from '@/domain/model/types';

// ── Model registry ─────────────────────────────────────────────────────────────

export type LLMModel = 'gemini-flash' | 'gemini-pro' | 'claude-opus';

export type LLMModelConfig = {
  label: string;
  id: string;
  contextTokens: number;
  badge: string;
  badgeClass: string;
};

export const LLM_MODELS: Record<LLMModel, LLMModelConfig> = {
  'gemini-flash': {
    label: 'Gemini 2.0 Flash',
    id: 'google/gemini-2.0-flash-001',
    contextTokens: 1_000_000,
    badge: 'Fast',
    badgeClass: 'bg-sky-100 text-sky-700',
  },
  'gemini-pro': {
    label: 'Gemini 2.5 Pro',
    id: 'google/gemini-2.5-pro-preview',
    contextTokens: 1_000_000,
    badge: 'Deep',
    badgeClass: 'bg-violet-100 text-violet-700',
  },
  'claude-opus': {
    label: 'Claude Opus 4.5',
    id: 'anthropic/claude-opus-4-5',
    contextTokens: 200_000,
    badge: 'Expert',
    badgeClass: 'bg-amber-100 text-amber-700',
  },
};

// ── Shared result types ────────────────────────────────────────────────────────

export type LLMFindingSeverity = 'error' | 'warning' | 'info';
export type LLMFindingCategory = 'naming' | 'structure' | 'mapping' | 'cardinality' | 'best-practice' | 'performance' | 'completeness';

export type LLMFinding = {
  severity: LLMFindingSeverity;
  category: LLMFindingCategory;
  title: string;
  description: string;
  path?: string;
  suggestion?: string;
};

export type LLMReviewResult = {
  summary: string;
  score: number | null;
  recommendations: LLMFinding[];
  model: string;
  mode: 'full' | 'summary';
  inputTokenEst: number;
};

// ── Token estimation ───────────────────────────────────────────────────────────

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ── Structural summary (for schemas that exceed context budget) ────────────────

function flattenTypes(
  types: ObjectTypeDefinition[],
  depth = 0,
  lines: string[] = [],
): string[] {
  for (const t of types) {
    const indent = '  '.repeat(depth);
    const attrs = (t.attributes ?? [])
      .map((a) => `${a.name}:${a.type}${a.label ? '(label)' : ''}`)
      .join(', ');
    lines.push(`${indent}- ${t.name} [id:${t.externalId}]${t.abstractObject ? ' (abstract)' : ''}`);
    if (attrs) lines.push(`${indent}  attrs: ${attrs}`);
    if (t.children?.length) flattenTypes(t.children, depth + 1, lines);
  }
  return lines;
}

function buildStructuralSummary(doc: AssetsImportDocument): string {
  const mappings = doc.mapping.objectTypeMappings;
  const mappedIds = new Set(mappings.map((m) => m.objectTypeExternalId));

  const typeLines = flattenTypes(doc.schema.objectSchema.objectTypes);
  // Annotate unmapped types after the tree is built
  const annotated = typeLines.map((line) => {
    const idMatch = line.match(/\[id:([^\]]+)\]/);
    if (idMatch) {
      const id = idMatch[1];
      return mappedIds.has(id) ? line : `${line} [UNMAPPED]`;
    }
    return line;
  });

  const mappingLines = mappings.map((m) => {
    const attrCount = m.attributesMapping?.length ?? 0;
    return `- ${m.objectTypeExternalId}: selector="${m.selector ?? ''}" attrs=${attrCount}`;
  });

  return [
    '## AssetsImportDocument — Structural Summary',
    `Object type count: ${typeLines.filter((l) => l.trim().startsWith('-')).length}`,
    `Mapping count: ${mappings.length}`,
    '',
    '### Object Type Tree (with [UNMAPPED] annotation)',
    ...annotated,
    '',
    '### Mappings',
    ...mappingLines,
  ].join('\n');
}

// ── JSON output schema (shared across all prompts) ─────────────────────────────

const OUTPUT_SCHEMA = `{
  "summary": "<2-3 sentence executive summary of schema quality>",
  "score": <integer 0-100>,
  "recommendations": [
    {
      "severity": "error|warning|info",
      "category": "naming|structure|mapping|cardinality|best-practice|performance|completeness",
      "title": "<short title, max 10 words>",
      "description": "<detailed explanation>",
      "path": "<JSON pointer or empty string>",
      "suggestion": "<concrete remediation step>"
    }
  ]
}`;

// ── Per-model system prompts ───────────────────────────────────────────────────

function geminiFlashPrompt(): string {
  return `You are an expert Atlassian JSM Assets schema analyst. Review the provided AssetsImportDocument and return ONLY a JSON object. No markdown fences, no prose before or after the JSON.

Output schema:
${OUTPUT_SCHEMA}

Scoring:
- 90-100: clean, complete, production-ready
- 70-89: minor issues, ready with small fixes
- 50-69: moderate issues to fix before go-live
- 30-49: significant structural or mapping problems
- 0-29: critical issues blocking deployment

Check every category:
- naming: consistent conventions (PascalCase types, camelCase attrs), no duplicates, no names starting with digits or special chars
- structure: hierarchy depth, orphaned types, abstractObject usage, inheritance flags
- mapping: unmapped object types, missing selectors/locators, coverage gaps, IQL correctness
- cardinality: min > max violations, boolean attrs with cardinality > 1, required attrs on abstract types
- best-practice: missing label attributes, missing descriptions on root types, externalId uniqueness
- performance: types with >25 attributes, hierarchies deeper than 5 levels, low mapping coverage ratio
- completeness: infer the domain this schema is modelling from its type names (e.g. IT assets, HR, facilities). Then identify entities or relationships that are clearly expected in that domain but absent from the schema. Flag gaps that would make the schema incomplete for its apparent purpose. Do not invent gaps — only flag what is obviously missing given what is already there.

Be direct and specific. Return 5-15 findings max. Every finding needs a path and a suggestion.`;
}

function geminiProPrompt(): string {
  return `You are a principal Atlassian platform architect with deep expertise in JSM Assets external import schema design. Perform a thorough architectural review of the provided AssetsImportDocument.

Think through the schema systematically:
1. Overall structure: hierarchy depth, object type count, type relationships, inheritance patterns
2. Naming discipline: consistency across the full type tree, attribute naming conventions, externalId patterns
3. Mapping completeness: which types lack mappings, selector fragility, locator coverage, IQL expression quality
4. Cardinality correctness: logical validity of all constraints, operational risk from misconfigured cardinalities
5. Anti-patterns: God objects (>30 attrs), over-normalised deep trees, redundant abstract types, inconsistent label attr placement
6. Production readiness: what will break first when this schema runs against real data at scale?
7. Domain completeness: infer the real-world domain this schema models from its type names and structure. Identify entities or relationships that are clearly implied by the domain but absent. Only flag gaps that are obvious given what already exists — not theoretical additions.

Return ONLY a JSON object. No markdown fences. No preamble.

Output schema:
${OUTPUT_SCHEMA}

Severity definitions:
- error: will cause import failures or data integrity problems
- warning: suboptimal but functional; fix before production
- info: best-practice improvement; low urgency

Prioritise: put the highest-impact issues first in the recommendations array.
Be specific: every recommendation must name the exact object type, attribute, or path it refers to.
Depth over breadth: prefer 8-12 focused findings over 20 surface-level observations.`;
}

function claudeOpusPrompt(): string {
  return `<role>
You are a senior Atlassian consulting architect specialising in JSM Assets schema governance, data modelling, and import source configuration. You have reviewed hundreds of production schemas.
</role>

<task>
Review the provided AssetsImportDocument. Identify the most important issues and improvements that would make this schema more correct, maintainable, and performant in production. Focus on what actually matters, not theoretical perfection.
</task>

<output_format>
Return ONLY a valid JSON object. No markdown code fences. No text before or after the JSON.

Required schema:
${OUTPUT_SCHEMA}
</output_format>

<analysis_dimensions>
1. NAMING — Check for: inconsistent capitalisation across type tree, attribute names that break the schema's own convention, names with special characters or spaces, duplicate names at same hierarchy level.

2. STRUCTURE — Assess: is hierarchy depth appropriate for the domain? Are abstractObject flags used correctly? Is inheritance wired up (inheritance:true) or just implied by nesting? Are leaf types appropriately concrete?

3. MAPPING — Audit: every unmapped object type that should be mapped, selector and locator completeness, IQL expressions that reference non-existent fields, attribute mappings with empty locators.

4. CARDINALITY — Verify: min ≤ max on every attribute, boolean attributes with maximumCardinality > 1 (logically invalid), minimumCardinality=1 on attributes of abstract types (can't be enforced), unreachable cardinality combinations.

5. BEST PRACTICE — Check: at least one label:true attribute per concrete type, description fields on top-level types, externalId values that are stable and human-readable (not GUIDs), statusSchema alignment.

6. PERFORMANCE — Flag: types with >25 attributes (consider splitting), hierarchies deeper than 5 levels (query cost), schemas with <50% mapping coverage (import will skip most types).

7. COMPLETENESS — First, infer the real-world domain this schema is modelling from its object type names, attribute names, and relationships (e.g. IT asset management, HR, network infrastructure, facilities). State your inference explicitly in the finding description. Then identify entities or relationships that are clearly expected in that domain but missing from the schema. Only flag gaps that are strongly implied by what already exists — not generic additions. Rate each gap as warning (obvious omission) or info (useful but not critical).
</analysis_dimensions>

<scoring>
Score 0-100 based on severity-weighted issue count:
- Start at 100
- Each error: -10 to -15 points
- Each warning: -3 to -5 points
- Each info: -0 to -1 point
Never go below 0. A schema with no issues scores 100.
</scoring>

<style>
Write descriptions that a developer can act on immediately. State what is wrong, why it matters, and exactly what to change. Avoid vague language like "consider" or "may want to".
Prioritise findings by impact. Put errors first, then warnings, then info.
</style>`;
}

// ── Prompt assembly ────────────────────────────────────────────────────────────

export type PromptPayload = {
  systemPrompt: string;
  userContent: string;
  mode: 'full' | 'summary';
  inputTokenEst: number;
};

export function buildPrompt(doc: AssetsImportDocument, model: LLMModel): PromptPayload {
  const cfg = LLM_MODELS[model];
  const fullJson = JSON.stringify(doc, null, 2);
  const fullEst = estimateTokens(fullJson);

  // Reserve 20k tokens for system prompt + model response headroom
  const budget = cfg.contextTokens - 20_000;

  let userContent: string;
  let mode: 'full' | 'summary';

  if (fullEst <= budget) {
    userContent = `Analyze this AssetsImportDocument:\n\n${fullJson}`;
    mode = 'full';
  } else {
    const summary = buildStructuralSummary(doc);
    userContent = `The full schema exceeds the context budget. Analyze this structural summary instead:\n\n${summary}`;
    mode = 'summary';
  }

  const systemPrompt =
    model === 'gemini-flash' ? geminiFlashPrompt()
    : model === 'gemini-pro' ? geminiProPrompt()
    : claudeOpusPrompt();

  return {
    systemPrompt,
    userContent,
    mode,
    inputTokenEst: estimateTokens(systemPrompt + userContent),
  };
}
