import { describe, expect, it } from 'vitest';
import fixture from '@/tests/fixtures/sampleDocument.json';
import { parseAssetsImportDocument } from '@/domain/normalizers/normalizeAssetsImportDocument';
import { buildPrompt, estimateTokens, LLM_MODELS, type LLMModel } from '@/domain/llm/reviewPrompt';
import type { AssetsImportDocument, ObjectTypeDefinition } from '@/domain/model/types';

const MODEL_KEYS = Object.keys(LLM_MODELS) as LLMModel[];

function sampleDoc(): AssetsImportDocument {
  return parseAssetsImportDocument(JSON.stringify(fixture)).document as AssetsImportDocument;
}

/** Builds a document whose JSON is large enough to blow past a context budget. */
function oversizedDoc(approxTokens: number): AssetsImportDocument {
  const doc = sampleDoc();
  const padding = 'x'.repeat(4); // ~1 token per attribute name chunk
  const objectTypes: ObjectTypeDefinition[] = [];
  // Each generated type contributes a few hundred characters of JSON.
  const typesNeeded = Math.ceil((approxTokens * 4) / 300);
  for (let i = 0; i < typesNeeded; i += 1) {
    objectTypes.push({
      externalId: `bulk-type-${i}`,
      name: `BulkType${i}${padding}`,
      description: `Generated type ${i} used to exceed the model context budget in tests.`,
      attributes: [
        { externalId: `bulk-attr-${i}`, name: `bulkAttribute${i}`, type: 'text' },
      ],
    } as ObjectTypeDefinition);
  }
  doc.schema.objectSchema.objectTypes = [...doc.schema.objectSchema.objectTypes, ...objectTypes];
  return doc;
}

describe('LLM_MODELS registry', () => {
  it('exposes exactly the three review slots', () => {
    expect(MODEL_KEYS).toEqual(['gemini-flash', 'gemini-pro', 'claude-opus']);
  });

  it.each(MODEL_KEYS)('%s has a provider-qualified id and sane limits', (key) => {
    const cfg = LLM_MODELS[key];
    // OpenRouter ids are always "<provider>/<model>".
    expect(cfg.id).toMatch(/^[a-z0-9-]+\/[a-z0-9.\-]+$/);
    expect(cfg.label.length).toBeGreaterThan(0);
    expect(cfg.contextTokens).toBeGreaterThanOrEqual(200_000);
    expect(cfg.maxOutputTokens).toBeGreaterThan(0);
    // Output reservation must leave real room for input.
    expect(cfg.maxOutputTokens).toBeLessThan(cfg.contextTokens / 2);
  });

  it('omits temperature only for the Anthropic slot', () => {
    expect(LLM_MODELS['gemini-flash'].supportsTemperature).toBe(true);
    expect(LLM_MODELS['gemini-pro'].supportsTemperature).toBe(true);
    expect(LLM_MODELS['claude-opus'].supportsTemperature).toBe(false);
  });

  it('uses distinct model ids across slots', () => {
    const ids = MODEL_KEYS.map((k) => LLM_MODELS[k].id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('buildPrompt', () => {
  it.each(MODEL_KEYS)('%s sends the sample document in full mode', (key) => {
    const { mode, systemPrompt, userContent, inputTokenEst } = buildPrompt(sampleDoc(), key);
    expect(mode).toBe('full');
    expect(systemPrompt).toContain('JSON');
    expect(userContent).toContain('Analyze this AssetsImportDocument');
    expect(inputTokenEst).toBeGreaterThan(0);
  });

  it.each(MODEL_KEYS)('%s uses a per-model system prompt', (key) => {
    const others = MODEL_KEYS.filter((k) => k !== key);
    const prompt = buildPrompt(sampleDoc(), key).systemPrompt;
    for (const other of others) {
      expect(prompt).not.toBe(buildPrompt(sampleDoc(), other).systemPrompt);
    }
  });

  it.each(MODEL_KEYS)('%s falls back to summary mode past its context budget', (key) => {
    const cfg = LLM_MODELS[key];
    const doc = oversizedDoc(cfg.contextTokens);
    const { mode, userContent } = buildPrompt(doc, key);
    expect(mode).toBe('summary');
    expect(userContent).toContain('structural summary');
  });

  it.each(MODEL_KEYS)('%s keeps the estimated prompt inside the context window', (key) => {
    const cfg = LLM_MODELS[key];
    // Even at the summary fallback, prompt + reserved output must fit.
    const doc = oversizedDoc(cfg.contextTokens);
    const { inputTokenEst } = buildPrompt(doc, key);
    expect(inputTokenEst + cfg.maxOutputTokens).toBeLessThan(cfg.contextTokens);
  });

  it('reserves output tokens, so a document that fits raw JSON can still summarise', () => {
    // A document sized just under raw context but over context-minus-output must
    // not be sent in full mode.
    const cfg = LLM_MODELS['claude-opus'];
    const doc = oversizedDoc(cfg.contextTokens - Math.floor(cfg.maxOutputTokens / 2));
    const { mode } = buildPrompt(doc, 'claude-opus');
    expect(mode).toBe('summary');
  });
});

describe('estimateTokens', () => {
  it('approximates four characters per token', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});
