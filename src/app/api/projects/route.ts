import { NextResponse } from 'next/server';
import { listStoredProjectsForUser, saveStoredProject, type StoredProject } from '@/lib/projectsRepository';
import { createBlankDocument } from '@/domain/model/factory';
import type { AssetsImportDocument, ProjectSettings } from '@/domain/model/types';
import { auth } from '@/lib/auth';

function createProjectId(): string {
  return `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projects = await listStoredProjectsForUser(session.user.id, session.user.email ?? undefined);
  return NextResponse.json({ projects });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({})) as {
    name?: string;
    document?: AssetsImportDocument;
    validationConfig?: Record<string, boolean>;
    projectSettings?: ProjectSettings;
  };

  const now = new Date().toISOString();
  const project: StoredProject = {
    id: createProjectId(),
    name: body.name?.trim() || 'Untitled Project',
    createdAt: now,
    updatedAt: now,
    revision: 0,
    status: 'open',
    ownerId: session.user.id,
    global: false,
    document: body.document ?? createBlankDocument(),
    versions: [],
    baselines: [],
    validationConfig: body.validationConfig ?? {},
    projectSettings: body.projectSettings ?? {},
    activity: [{
      id: `activity-${Date.now().toString(36)}`,
      at: now,
      action: 'PROJECT_CREATED',
      detail: 'Project created on disk.',
    }],
  };

  await saveStoredProject(project);
  return NextResponse.json({ project }, { status: 201 });
}
