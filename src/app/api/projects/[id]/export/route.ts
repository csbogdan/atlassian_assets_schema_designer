import { NextResponse } from 'next/server';
import { loadStoredProject } from '@/lib/projectsRepository';
import { auth } from '@/lib/auth';
import { getEffectivePermissions } from '@/lib/permissions';
import { applyStaging } from '@/domain/transformers/stagingFilter';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const project = await loadStoredProject(id);
  const userId = session.user.id;

  const perms = project ? getEffectivePermissions(project, userId, session.user.email ?? undefined) : null;
  if (!perms?.read) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const exportDocument = applyStaging(project!.document, project!.stagedForDeletion ?? []);
  const safeName = `${encodeURIComponent(project!.name.replace(/\s+/g, '-').toLowerCase())}-schema.json`;
  return new NextResponse(JSON.stringify(exportDocument, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename*=UTF-8''${safeName}`,
    },
  });
}
