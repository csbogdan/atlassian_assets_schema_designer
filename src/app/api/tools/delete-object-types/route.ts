import { NextResponse } from 'next/server';

type DeleteRequest = {
  site: string;
  email: string;
  apiToken: string;
  schemaId: string;
  dryRun?: boolean;
};

async function basicAuthFetch(url: string, email: string, token: string, method = 'GET') {
  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  const r = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
    },
  });
  return r;
}

type ObjType = { id: string; name: string; parentId: string | null };

function computeDepth(id: string, byId: Map<string, ObjType>, cache: Map<string, number>, seen = new Set<string>()): number {
  if (cache.has(id)) return cache.get(id)!;
  if (seen.has(id)) return 0;
  seen.add(id);
  const parent = byId.get(id)?.parentId;
  const d = parent ? 1 + computeDepth(parent, byId, cache, seen) : 0;
  cache.set(id, d);
  return d;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as DeleteRequest;
  const { site, email, apiToken, schemaId, dryRun } = body;

  if (!site || !email || !apiToken || !schemaId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const log: string[] = [];

  try {
    // 1. Get workspace
    log.push(`Discovering workspace on ${site}...`);
    const wsResp = await basicAuthFetch(`https://${site}/rest/servicedeskapi/assets/workspace`, email, apiToken);
    if (!wsResp.ok) throw new Error(`Workspace fetch failed: ${wsResp.status}`);
    const wsData = await wsResp.json() as { values?: Array<{ workspaceId: string }> } | Array<{ workspaceId: string }>;
    const vals = Array.isArray(wsData) ? wsData : wsData.values ?? [];
    if (!vals.length) throw new Error('No workspace found');
    const workspaceId = vals[0].workspaceId;
    log.push(`workspaceId: ${workspaceId}`);

    const base = `https://api.atlassian.com/jsm/assets/workspace/${workspaceId}/v1`;

    // 2. List object types
    log.push(`Listing object types in schema ${schemaId}...`);
    const typesResp = await basicAuthFetch(`${base}/objectschema/${schemaId}/objecttypes/flat`, email, apiToken);
    if (!typesResp.ok) throw new Error(`Object types fetch failed: ${typesResp.status}`);
    const rawTypes = await typesResp.json() as Array<Record<string, unknown>>;

    const types: ObjType[] = rawTypes.map((t) => {
      const parentId = t.parentObjectTypeId
        ?? (t.parentObjectType as Record<string, unknown> | undefined)?.id;
      return {
        id: String(t.id ?? ''),
        name: String(t.name ?? ''),
        parentId: parentId ? String(parentId) : null,
      };
    });

    log.push(`Found ${types.length} object types.`);

    if (types.length === 0) {
      return NextResponse.json({ log, deleted: 0, errors: 0 });
    }

    // 3. Compute deletion order (deepest first)
    const byId = new Map(types.map((t) => [t.id, t]));
    const depthCache = new Map<string, number>();
    const sorted = [...types].sort((a, b) => {
      const da = computeDepth(a.id, byId, depthCache);
      const db = computeDepth(b.id, byId, depthCache);
      return db - da; // deepest first
    });

    const plan = sorted.map((t, i) => {
      const d = depthCache.get(t.id) ?? 0;
      return `  [${i + 1}] depth=${d} id=${t.id} name=${t.name}`;
    });
    log.push('Deletion order (deepest first):');
    log.push(...plan);

    if (dryRun) {
      log.push(`[dry-run] Would delete ${types.length} object types. No changes made.`);
      return NextResponse.json({ log, dryRun: true, plannedCount: types.length });
    }

    // 4. Delete in order
    let deleted = 0;
    let errors = 0;
    for (const t of sorted) {
      const url = `${base}/objecttype/${t.id}`;
      let success = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        const r = await basicAuthFetch(url, email, apiToken, 'DELETE');
        if (r.status === 200 || r.status === 204) { success = true; break; }
        if (r.status === 404) { success = true; log.push(`  SKIP (already gone): ${t.id} ${t.name}`); break; }
        if (r.status === 429) {
          const retryAfter = r.headers.get('Retry-After');
          await new Promise((resolve) => setTimeout(resolve, retryAfter ? Number(retryAfter) * 1000 : 2000));
          continue;
        }
        const text = await r.text().catch(() => '');
        log.push(`  ERROR (attempt ${attempt + 1}): ${t.id} ${t.name} → ${r.status} ${text.slice(0, 200)}`);
        if (r.status === 400 || r.status === 409) break; // don't retry constraint errors
      }
      if (success) {
        deleted++;
        log.push(`  DELETED: ${t.id} ${t.name}`);
      } else {
        errors++;
      }
    }

    log.push(`Done. Deleted: ${deleted}, Errors: ${errors}, Total: ${types.length}`);
    return NextResponse.json({ log, deleted, errors, total: types.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.push(`FATAL ERROR: ${message}`);
    return NextResponse.json({ error: message, log }, { status: 502 });
  }
}
