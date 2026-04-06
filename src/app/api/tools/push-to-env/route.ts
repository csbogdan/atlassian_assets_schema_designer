import { NextResponse } from 'next/server';
import type { AssetsImportDocument } from '@/domain/model/types';

type PushToEnvRequest = {
  token: string;
  document: AssetsImportDocument;
};

type Log = string[];

async function atlassianFetch(
  url: string,
  token: string,
  options?: RequestInit,
): Promise<{ ok: boolean; status: number; body: unknown; text: string }> {
  const r = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });
  const text = await r.text().catch(() => '');
  let body: unknown;
  try { body = JSON.parse(text); } catch { body = text; }
  return { ok: r.ok, status: r.status, body, text };
}

// POST /api/tools/push-to-env
// Body: { token, document }
// Flow:
//   1. GET https://api.atlassian.com/jsm/assets/v1/imports/info  → links.mapping URL
//   2. POST schema payload to that URL
export async function POST(request: Request) {
  let body: PushToEnvRequest;
  try {
    body = await request.json() as PushToEnvRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { token, document } = body;

  if (!token || !document) {
    return NextResponse.json(
      { error: 'Missing required fields: token, document' },
      { status: 400 },
    );
  }

  const log: Log = [];

  try {
    // Step 1 — discover the mapping URL
    log.push('Calling imports/info to discover mapping endpoint…');
    const infoRes = await atlassianFetch(
      'https://api.atlassian.com/jsm/assets/v1/imports/info',
      token,
    );

    if (!infoRes.ok) {
      log.push(`imports/info returned ${infoRes.status}: ${infoRes.text.slice(0, 400)}`);
      return NextResponse.json(
        { error: `Atlassian API error ${infoRes.status}`, log },
        { status: 502 },
      );
    }

    const info = infoRes.body as Record<string, unknown>;
    const links = info['links'] as Record<string, string> | undefined;
    const mappingUrl = typeof links?.['mapping'] === 'string' ? links['mapping'] : undefined;

    if (!mappingUrl) {
      log.push('Response did not contain a "mapping" link. Raw response:');
      log.push(JSON.stringify(info, null, 2).slice(0, 2000));
      return NextResponse.json(
        { error: 'No mapping URL found in imports/info response', log },
        { status: 502 },
      );
    }

    log.push(`Mapping URL: ${mappingUrl}`);

    // Step 2 — push the schema document
    log.push('Pushing schema to mapping endpoint…');
    const pushRes = await atlassianFetch(mappingUrl, token, {
      method: 'PATCH',
      body: JSON.stringify(document),
      signal: AbortSignal.timeout(120_000), // 2 minutes
    });

    log.push(`Response status: ${pushRes.status}`);

    if (!pushRes.ok) {
      log.push(`Push failed: ${pushRes.text.slice(0, 1000)}`);
      return NextResponse.json(
        { error: `Push failed with status ${pushRes.status}`, log },
        { status: 502 },
      );
    }

    log.push('Schema pushed successfully.');
    return NextResponse.json({ ok: true, log, response: pushRes.body });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.push(`Error: ${message}`);
    return NextResponse.json({ error: message, log }, { status: 502 });
  }
}
