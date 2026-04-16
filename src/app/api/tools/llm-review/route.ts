import { NextResponse } from 'next/server';
import type { AssetsImportDocument } from '@/domain/model/types';
import { buildPrompt, LLM_MODELS, type LLMModel } from '@/domain/llm/reviewPrompt';

// Allow up to 120 s for large-schema analysis on heavy models
export const maxDuration = 120;

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  // Strip markdown code fences if the model disobeys instructions
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/s);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();
  // Extract outermost {...} if there's prose around the JSON
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENROUTER_API_KEY is not configured on the server. Add it to .env.local.' },
      { status: 503 },
    );
  }

  let body: { document?: AssetsImportDocument; model?: LLMModel };
  try {
    body = await request.json() as { document?: AssetsImportDocument; model?: LLMModel };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { document, model = 'gemini-flash' } = body;

  if (!document?.schema?.objectSchema) {
    return NextResponse.json({ error: 'Missing or invalid document payload' }, { status: 400 });
  }

  const modelConfig = LLM_MODELS[model];
  if (!modelConfig) {
    return NextResponse.json({ error: `Unknown model key: ${model}` }, { status: 400 });
  }

  const { systemPrompt, userContent, mode, inputTokenEst } = buildPrompt(document, model);

  let openRouterResponse: Response;
  try {
    openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/csbogdan/atlassian_assets_schema_designer',
        'X-Title': 'JSM Assets Schema Designer',
      },
      body: JSON.stringify({
        model: modelConfig.id,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.2,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Network error calling OpenRouter: ${message}` }, { status: 502 });
  }

  if (!openRouterResponse.ok) {
    const text = await openRouterResponse.text().catch(() => '');
    return NextResponse.json(
      { error: `OpenRouter API error ${openRouterResponse.status}: ${text}` },
      { status: 502 },
    );
  }

  const completion = await openRouterResponse.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    error?: { message?: string };
  };

  if (completion.error?.message) {
    return NextResponse.json({ error: completion.error.message }, { status: 502 });
  }

  const rawContent = completion.choices?.[0]?.message?.content ?? '';
  if (!rawContent) {
    return NextResponse.json({ error: 'Model returned an empty response' }, { status: 502 });
  }

  let parsed: { summary?: string; score?: unknown; recommendations?: unknown[] };
  try {
    parsed = JSON.parse(extractJson(rawContent)) as {
      summary?: string;
      score?: unknown;
      recommendations?: unknown[];
    };
  } catch {
    return NextResponse.json(
      { error: 'Model returned a non-JSON response', raw: rawContent.slice(0, 500) },
      { status: 502 },
    );
  }

  return NextResponse.json({
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    score: typeof parsed.score === 'number' ? parsed.score : null,
    recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
    model: modelConfig.label,
    mode,
    inputTokenEst,
    usage: completion.usage ?? null,
  });
}
