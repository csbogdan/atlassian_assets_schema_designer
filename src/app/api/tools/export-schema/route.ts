import { NextResponse } from 'next/server';

type ExportRequest = {
  site: string;
  email: string;
  apiToken: string;
  schemaId: string;
  dryRun?: boolean;
};

async function basicAuthFetch(url: string, email: string, token: string) {
  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  const r = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
    },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`API error ${r.status} at ${url}: ${text}`);
  }
  return r.json();
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as ExportRequest;
  const { site, email, apiToken, schemaId, dryRun } = body;

  if (!site || !email || !apiToken || !schemaId) {
    return NextResponse.json({ error: 'Missing required fields: site, email, apiToken, schemaId' }, { status: 400 });
  }

  const log: string[] = [];

  try {
    // 1. Get workspace ID
    log.push(`Discovering workspace on ${site}...`);
    const wsData = await basicAuthFetch(
      `https://${site}/rest/servicedeskapi/assets/workspace`,
      email,
      apiToken,
    ) as { values?: Array<{ workspaceId: string }> } | Array<{ workspaceId: string }>;

    const vals = Array.isArray(wsData) ? wsData : wsData.values ?? [];
    if (!vals.length) throw new Error('No Assets workspace found');
    const workspaceId = vals[0].workspaceId;
    log.push(`workspaceId: ${workspaceId}`);

    const base = `https://api.atlassian.com/jsm/assets/workspace/${workspaceId}/v1`;

    // 2. List object types flat
    log.push(`Fetching object types for schema ${schemaId}...`);
    const types = await basicAuthFetch(`${base}/objectschema/${schemaId}/objecttypes/flat`, email, apiToken) as Array<Record<string, unknown>>;
    log.push(`Found ${types.length} object types.`);

    if (dryRun) {
      log.push('[dry-run] Would fetch attributes for each object type and build manifest.');
      return NextResponse.json({ log, dryRun: true, objectTypeCount: types.length });
    }

    // 3. Fetch attributes for each type
    const exported = await Promise.all(types.map(async (t) => {
      const tid = String(t.id ?? '');
      const attrs = await basicAuthFetch(`${base}/objecttype/${tid}/attributes`, email, apiToken).catch(() => []) as unknown[];
      const iconMeta = (t.icon as Record<string, unknown> | undefined) ?? {};
      return {
        id: tid,
        name: t.name,
        description: t.description,
        parentObjectTypeId: (t.parentObjectType as Record<string, unknown> | undefined)?.id ?? t.parentObjectTypeId,
        icon: {
          id: String(iconMeta.id ?? ''),
          name: iconMeta.name,
          url16: iconMeta.url16,
          url48: iconMeta.url48,
        },
        position: t.position,
        created: t.created,
        updated: t.updated,
        attributes: attrs,
      };
    }));

    const manifest = {
      site,
      workspaceId,
      schemaId,
      exportedAt: new Date().toISOString(),
      objectTypes: exported,
    };

    log.push(`Export complete: ${exported.length} object types with attributes.`);
    return NextResponse.json({ log, manifest });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.push(`ERROR: ${message}`);
    return NextResponse.json({ error: message, log }, { status: 502 });
  }
}
