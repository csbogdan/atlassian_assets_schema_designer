import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { loadStoredProject } from '@/lib/projectsRepository';
import { getEffectivePermissions } from '@/lib/permissions';
import { getProjectChangeLog } from '@/lib/db';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const project = await loadStoredProject(id);
  const perms = project ? getEffectivePermissions(project, session.user.id, session.user.email ?? undefined) : null;

  if (!project || !perms?.read) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const url = new URL(request.url);
  const path = url.searchParams.get('path') ?? undefined;
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '100'), 500);
  const offset = Number(url.searchParams.get('offset') ?? '0');

  const rows = await getProjectChangeLog({ projectId: id, path, limit, offset });
  return NextResponse.json({ changelog: rows });
}
