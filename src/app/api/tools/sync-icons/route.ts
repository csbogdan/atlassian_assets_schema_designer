import { NextResponse } from 'next/server';

type SyncIconsRequest = {
  srcSite: string;
  srcEmail: string;
  srcToken: string;
  srcSchemaId: string;
  dstSite: string;
  dstEmail: string;
  dstToken: string;
  dstSchemaId: string;
  ignoreCase?: boolean;
  dryRun?: boolean;
};

type ObjType = { id: string; name: string; iconId: string | null };

async function basicAuthFetch(
  url: string,
  email: string,
  token: string,
  method = 'GET',
  body?: unknown,
) {
  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  const r = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return r;
}

async function getWorkspaceId(site: string, email: string, token: string): Promise<string> {
  const r = await basicAuthFetch(`https://${site}/rest/servicedeskapi/assets/workspace`, email, token);
  if (!r.ok) throw new Error(`Workspace fetch failed on ${site}: ${r.status}`);
  const data = await r.json() as { values?: Array<{ workspaceId: string }> } | Array<{ workspaceId: string }>;
  const vals = Array.isArray(data) ? data : (data.values ?? []);
  if (!vals.length) throw new Error(`No Assets workspace found on ${site}`);
  return vals[0].workspaceId;
}

async function listObjectTypesFlat(workspaceId: string, schemaId: string, email: string, token: string): Promise<ObjType[]> {
  const url = `https://api.atlassian.com/jsm/assets/workspace/${workspaceId}/v1/objectschema/${schemaId}/objecttypes/flat`;
  const r = await basicAuthFetch(url, email, token);
  if (!r.ok) throw new Error(`Object types fetch failed for schema ${schemaId}: ${r.status}`);
  const items = await r.json() as Array<Record<string, unknown>>;
  return items.map((it) => {
    const icon = (it.icon ?? {}) as Record<string, unknown>;
    return {
      id: String(it.id ?? ''),
      name: String(it.name ?? ''),
      iconId: icon.id != null ? String(icon.id) : null,
    };
  });
}

async function putIcon(
  workspaceId: string,
  typeId: string,
  iconId: string,
  email: string,
  token: string,
): Promise<{ ok: boolean; status: number; message: string }> {
  const url = `https://api.atlassian.com/jsm/assets/workspace/${workspaceId}/v1/objecttype/${typeId}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await basicAuthFetch(url, email, token, 'PUT', { iconId });
    if (r.status === 200 || r.status === 204) return { ok: true, status: r.status, message: 'Updated' };
    if (r.status === 401 || r.status === 403) return { ok: false, status: r.status, message: `Auth error (${r.status})` };
    if (r.status === 404) return { ok: false, status: r.status, message: 'Object type not found on destination' };
    if (r.status === 429) {
      const retryAfter = r.headers.get('Retry-After');
      await new Promise((res) => setTimeout(res, retryAfter ? Number(retryAfter) * 1000 : 2000));
      continue;
    }
    if (r.status >= 500) {
      await new Promise((res) => setTimeout(res, [0, 1000, 2000, 4000][attempt] ?? 4000));
      continue;
    }
    const text = await r.text().catch(() => '');
    return { ok: false, status: r.status, message: `${r.status}: ${text.slice(0, 200)}` };
  }
  return { ok: false, status: 0, message: 'Failed after retries' };
}

function keyify(name: string, ignoreCase: boolean) {
  return ignoreCase ? name.toLowerCase() : name;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as SyncIconsRequest;
  const { srcSite, srcEmail, srcToken, srcSchemaId, dstSite, dstEmail, dstToken, dstSchemaId, ignoreCase = false, dryRun = true } = body;

  if (!srcSite || !srcEmail || !srcToken || !srcSchemaId || !dstSite || !dstEmail || !dstToken || !dstSchemaId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const log: string[] = [];

  try {
    log.push(`Discovering source workspace on ${srcSite}...`);
    const srcWs = await getWorkspaceId(srcSite, srcEmail, srcToken);
    log.push(`Source workspaceId: ${srcWs}`);

    log.push(`Discovering destination workspace on ${dstSite}...`);
    const dstWs = await getWorkspaceId(dstSite, dstEmail, dstToken);
    log.push(`Destination workspaceId: ${dstWs}`);

    log.push(`Listing source object types (schema ${srcSchemaId})...`);
    const srcTypes = await listObjectTypesFlat(srcWs, srcSchemaId, srcEmail, srcToken);
    log.push(`Found ${srcTypes.length} source object types.`);

    log.push(`Listing destination object types (schema ${dstSchemaId})...`);
    const dstTypes = await listObjectTypesFlat(dstWs, dstSchemaId, dstEmail, dstToken);
    log.push(`Found ${dstTypes.length} destination object types.`);

    const srcMap = new Map(srcTypes.map((t) => [keyify(t.name, ignoreCase), t]));
    const dstMap = new Map(dstTypes.map((t) => [keyify(t.name, ignoreCase), t]));

    type Task = { dstId: string; dstName: string; iconId: string };
    const tasks: Task[] = [];
    let skipped = 0;
    let missing = 0;
    let noSrcIcon = 0;

    for (const [key, src] of srcMap) {
      const dst = dstMap.get(key);
      if (!dst) {
        log.push(`  MISSING_DST: "${src.name}" — not found in destination schema`);
        missing++;
        continue;
      }
      if (!src.iconId) {
        log.push(`  SKIP_NO_ICON: "${src.name}" — source has no icon`);
        noSrcIcon++;
        continue;
      }
      if (src.iconId === dst.iconId) {
        log.push(`  SKIP_SAME: "${src.name}" — already iconId=${src.iconId}`);
        skipped++;
        continue;
      }
      log.push(`  PLAN UPDATE: "${src.name}" — iconId ${dst.iconId ?? 'none'} → ${src.iconId}`);
      tasks.push({ dstId: dst.id, dstName: dst.name, iconId: src.iconId });
    }

    log.push(`Plan: ${tasks.length} update(s), ${skipped} already matching, ${missing} missing in dst, ${noSrcIcon} with no src icon.`);

    if (dryRun) {
      log.push('[dry-run] No changes made.');
      return NextResponse.json({ log, dryRun: true, plannedCount: tasks.length });
    }

    let updated = 0;
    let errors = 0;
    for (const task of tasks) {
      log.push(`  Updating "${task.dstName}" [${task.dstId}] → iconId=${task.iconId}...`);
      const res = await putIcon(dstWs, task.dstId, task.iconId, dstEmail, dstToken);
      if (res.ok) {
        updated++;
        log.push(`    OK`);
      } else {
        errors++;
        log.push(`    FAILED: ${res.message}`);
      }
    }

    log.push(`Done. Updated: ${updated}, Errors: ${errors}, Total planned: ${tasks.length}`);
    return NextResponse.json({ log, updated, errors, total: tasks.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.push(`FATAL ERROR: ${message}`);
    return NextResponse.json({ error: message, log }, { status: 502 });
  }
}
