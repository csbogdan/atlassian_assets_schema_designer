import { NextResponse } from 'next/server';
import { createAssetsImportSourceApi } from '@/domain/api/assetsImportSourceApi';

// GET /api/tools/mapping-progress?token=...&workspaceId=...&importSourceId=...&resourceId=...
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token')?.trim();
  const workspaceId = searchParams.get('workspaceId')?.trim();
  const importSourceId = searchParams.get('importSourceId')?.trim();
  const resourceId = searchParams.get('resourceId')?.trim();

  if (!token || !workspaceId || !importSourceId || !resourceId) {
    return NextResponse.json(
      { error: 'Missing required parameters: token, workspaceId, importSourceId, resourceId' },
      { status: 400 },
    );
  }

  try {
    const api = createAssetsImportSourceApi(token);
    const result = await api.getMappingProgress(workspaceId, importSourceId, resourceId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
