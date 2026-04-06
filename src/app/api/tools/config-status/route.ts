import { NextResponse } from 'next/server';
import { createAssetsImportSourceApi } from '@/domain/api/assetsImportSourceApi';

// GET /api/tools/config-status?token=...&workspaceId=...&importSourceId=...
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token')?.trim();
  const workspaceId = searchParams.get('workspaceId')?.trim();
  const importSourceId = searchParams.get('importSourceId')?.trim();

  if (!token || !workspaceId || !importSourceId) {
    return NextResponse.json(
      { error: 'Missing required parameters: token, workspaceId, importSourceId' },
      { status: 400 },
    );
  }

  try {
    const api = createAssetsImportSourceApi(token);
    const result = await api.getConfigStatus(workspaceId, importSourceId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
