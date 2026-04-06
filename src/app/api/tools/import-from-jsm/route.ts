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

/** Extract workspaceId and importSourceId from an Atlassian link URL such as
 *  https://api.atlassian.com/jsm/assets/workspace/{wid}/v1/importsource/{sid}/...
 */
function parseIdsFromLink(url: string): { workspaceId: string; importSourceId: string } | null {
  const m = url.match(/\/workspace\/([^/]+)\/v1\/importsource\/([^/]+)\//);
  if (!m) return null;
  return { workspaceId: m[1], importSourceId: m[2] };
}

/**
 * POST /api/tools/import-from-jsm
 *
 * Headers:
 *   Authorization: Bearer <atlassian-token>
 *
 * Body (JSON):
 *   { workspaceId?: string; importSourceId?: string }
 *
 * Without workspaceId + importSourceId:
 *   → Discovers import source from links in imports/info response
 *
 * With workspaceId + importSourceId:
 *   → Fetches schema-and-mapping for the given import source
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return NextResponse.json({ error: 'Missing Authorization header' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({})) as {
    workspaceId?: string;
    importSourceId?: string;
  };
  const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId.trim() : undefined;
  const importSourceId = typeof body.importSourceId === 'string' ? body.importSourceId.trim() : undefined;

  try {
    if (workspaceId && importSourceId) {
      // Step 2: fetch schema-and-mapping using the known IDs
      const schemaAndMapping = await atlassianFetch(
        `https://api.atlassian.com/jsm/assets/workspace/${workspaceId}/v1/importsource/${importSourceId}/schema-and-mapping`,
        token,
      );
      return NextResponse.json({ schemaAndMapping });
    }

    // Step 1: call imports/info and parse workspaceId + importSourceId from the link URLs
    const info = await atlassianFetch(`${BASE}/imports/info`, token) as Record<string, unknown>;

    // The response contains a "links" object whose URL values embed both IDs, e.g.
    // { links: { mapping: "https://.../workspace/{wid}/v1/importsource/{sid}/mapping", ... } }
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
      // Return raw response for debugging if IDs cannot be extracted
      return NextResponse.json({ raw: info }, { status: 200 });
    }

    return NextResponse.json({
      importSource: {
        workspaceId: ids.workspaceId,
        importSourceId: ids.importSourceId,
        links,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
