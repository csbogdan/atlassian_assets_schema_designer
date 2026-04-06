import { NextResponse } from 'next/server';

const BASE = 'https://api.atlassian.com/jsm/assets/v1';

async function atlassianFetch(url: string, token: string) {
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`Atlassian API error ${r.status}: ${text}`);
  }
  return r.json();
}

function parseIdsFromLink(url: string): { workspaceId: string; importSourceId: string } | null {
  const m = url.match(/\/workspace\/([^/]+)\/v1\/importsource\/([^/]+)\//);
  if (!m) return null;
  return { workspaceId: m[1], importSourceId: m[2] };
}

/**
 * POST /api/tools/remote-diff
 * Header: Authorization: Bearer <token>
 * Discovers the import source via imports/info, fetches schema-and-mapping,
 * and returns the remote document for client-side diffing against the local document.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return NextResponse.json({ error: 'Missing Authorization header' }, { status: 400 });
  }

  try {
    // Step 1: discover workspace + import source IDs
    const info = await atlassianFetch(`${BASE}/imports/info`, token) as Record<string, unknown>;
    const links = info.links as Record<string, string> | undefined;
    let ids: { workspaceId: string; importSourceId: string } | null = null;

    if (links && typeof links === 'object') {
      for (const url of Object.values(links)) {
        if (typeof url === 'string') {
          ids = parseIdsFromLink(url);
          if (ids) break;
        }
      }
    }

    if (!ids) {
      return NextResponse.json(
        { error: 'Could not extract workspace/import source IDs from Atlassian API response.' },
        { status: 502 },
      );
    }

    // Step 2: fetch the live schema-and-mapping
    const remoteDocument = await atlassianFetch(
      `https://api.atlassian.com/jsm/assets/workspace/${ids.workspaceId}/v1/importsource/${ids.importSourceId}/schema-and-mapping`,
      token,
    );

    return NextResponse.json({
      remoteDocument,
      workspaceId: ids.workspaceId,
      importSourceId: ids.importSourceId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
