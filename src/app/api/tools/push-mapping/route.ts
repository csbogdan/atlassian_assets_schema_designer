import { NextResponse } from 'next/server';
import { createAssetsImportSourceApi } from '@/domain/api/assetsImportSourceApi';
import type { AssetsImportDocument } from '@/domain/model/types';

type PushMappingRequest = {
  token: string;
  workspaceId: string;
  importSourceId: string;
  document: AssetsImportDocument;
  /** 'put' replaces the full mapping; 'patch' does a partial update. Default: 'put'. */
  method?: 'put' | 'patch';
  /** Whether to request async processing. Default: true. */
  async?: boolean;
};

// POST /api/tools/push-mapping
export async function POST(request: Request) {
  let body: PushMappingRequest;
  try {
    body = await request.json() as PushMappingRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { token, workspaceId, importSourceId, document, method = 'put', async: asyncFlag = true } = body;

  if (!token || !workspaceId || !importSourceId || !document) {
    return NextResponse.json(
      { error: 'Missing required fields: token, workspaceId, importSourceId, document' },
      { status: 400 },
    );
  }

  try {
    const api = createAssetsImportSourceApi(token);
    const result =
      method === 'patch'
        ? await api.patchMapping(workspaceId, importSourceId, document, { async: asyncFlag })
        : await api.putMapping(workspaceId, importSourceId, document, { async: asyncFlag });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
