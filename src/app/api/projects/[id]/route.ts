import { NextResponse } from 'next/server';
import { deleteStoredProject, loadStoredProject, saveStoredProject, type StoredProject } from '@/lib/projectsRepository';
import type { ProjectEnvironment, ProjectSettings } from '@/domain/model/types';
import { auth } from '@/lib/auth';
import { getEffectivePermissions } from '@/lib/permissions';
import { diffDocuments } from '@/lib/documentDiff';
import { recordProjectSave } from '@/lib/db';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const project = await loadStoredProject(id);

  if (!project || !getEffectivePermissions(project, session.user.id, session.user.email ?? undefined).read) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  return NextResponse.json({ project });
}

export async function PUT(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await loadStoredProject(id);
  const perms = existing ? getEffectivePermissions(existing, session.user.id, session.user.email ?? undefined) : null;

  if (!existing || !perms!.read) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }
  if (!perms!.write) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const raw = await request.json().catch(() => ({})) as Record<string, unknown>;

  const expectedUpdatedAt = typeof raw.expectedUpdatedAt === 'string' ? raw.expectedUpdatedAt : undefined;

  if (expectedUpdatedAt && existing.updatedAt !== expectedUpdatedAt) {
    return NextResponse.json({
      error: 'Project was modified outside your session. Refresh and retry.',
      currentUpdatedAt: existing.updatedAt,
    }, { status: 409 });
  }

  const now = new Date().toISOString();

  // Only allow an explicit field allow-list so clients cannot inject arbitrary keys.
  const project: StoredProject = {
    ...existing,
    name: typeof raw.name === 'string' ? raw.name.trim() || existing.name : existing.name,
    status: (raw.status === 'open' || raw.status === 'closed' || raw.status === 'archived')
      ? raw.status
      : existing.status,
    document: raw.document !== undefined ? (raw.document as StoredProject['document']) : existing.document,
    versions: Array.isArray(raw.versions) ? (raw.versions as StoredProject['versions']).slice(0, 30) : existing.versions,
    baselines: Array.isArray(raw.baselines) ? (raw.baselines as StoredProject['baselines']).slice(0, 30) : existing.baselines ?? [],
    activity: Array.isArray(raw.activity) ? (raw.activity as StoredProject['activity']).slice(0, 200) : existing.activity,
    validationConfig: raw.validationConfig !== undefined && typeof raw.validationConfig === 'object' && !Array.isArray(raw.validationConfig)
      ? (raw.validationConfig as Record<string, boolean>)
      : existing.validationConfig,
    projectSettings: raw.projectSettings !== undefined && typeof raw.projectSettings === 'object' && !Array.isArray(raw.projectSettings)
      ? (raw.projectSettings as ProjectSettings)
      : existing.projectSettings,
    stagedForDeletion: Array.isArray(raw.stagedForDeletion)
      ? (raw.stagedForDeletion as string[]).filter((v) => typeof v === 'string')
      : existing.stagedForDeletion ?? [],
    environments: Array.isArray(raw.environments)
      ? (raw.environments as ProjectEnvironment[]).filter(
          (e) => e && typeof e.id === 'string' && typeof e.name === 'string' && typeof e.token === 'string',
        ).slice(0, 20)
      : existing.environments ?? [],
    id,
    revision: Math.max(existing.revision + 1, (typeof raw.revision === 'number' ? raw.revision : existing.revision) + 1),
    updatedAt: now,
    createdAt: existing.createdAt,
  };

  await saveStoredProject(project);

  // Async — never block the response
  if (existing.document && project.document) {
    const changes = diffDocuments(existing.document, project.document);
    recordProjectSave({
      projectId: id,
      revision: project.revision,
      snapshotPath: `${id}.json`,
      changedBy: session.user.email ?? session.user.id,
      changes,
    }).catch(() => { /* non-critical */ });
  }

  return NextResponse.json({ project });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await loadStoredProject(id);
  const perms = existing ? getEffectivePermissions(existing, session.user.id, session.user.email ?? undefined) : null;

  if (!existing || !perms!.read) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const body = await request.json().catch(() => ({})) as {
    status?: 'open' | 'closed' | 'archived';
    global?: boolean;
    shareWith?: string;
    unshareWith?: string;
  };

  // Toggling global visibility requires ownership.
  if (body.global !== undefined && !perms!.admin) {
    return NextResponse.json({ error: 'Only the project owner can change sharing.' }, { status: 403 });
  }

  // Per-user sharing/unsharing requires ownership.
  if ((body.shareWith !== undefined || body.unshareWith !== undefined) && !perms!.admin) {
    return NextResponse.json({ error: 'Only the project owner can manage sharing.' }, { status: 403 });
  }

  if (body.status === undefined && body.global === undefined && body.shareWith === undefined && body.unshareWith === undefined) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const updatedGlobal = body.global !== undefined ? body.global : existing.global;
  const updatedStatus = body.status ?? existing.status;
  const updatedSharedWith = body.unshareWith
    ? (existing.sharedWith ?? []).filter((e) => e !== body.unshareWith)
    : body.shareWith
      ? [...new Set([...(existing.sharedWith ?? []), body.shareWith])].slice(0, 100)
      : existing.sharedWith;

  const by = session.user.email ?? session.user.id;
  const activityEntries = [];
  if (body.status !== undefined && body.status !== existing.status) {
    activityEntries.push({
      id: `activity-${Date.now().toString(36)}`,
      at: now,
      by,
      action: body.status === 'closed' ? 'PROJECT_CLOSED' : body.status === 'archived' ? 'PROJECT_ARCHIVED' : 'PROJECT_OPENED',
      detail: body.status === 'closed' ? 'Project closed.' : body.status === 'archived' ? 'Project archived.' : 'Project re-opened.',
    });
  }
  if (body.global !== undefined && body.global !== existing.global) {
    activityEntries.push({
      id: `activity-${Date.now().toString(36)}b`,
      at: now,
      by,
      action: body.global ? 'PROJECT_SHARED' : 'PROJECT_UNSHARED',
      detail: body.global ? 'Project made globally visible.' : 'Project made private.',
    });
  }
  if (body.shareWith) {
    activityEntries.push({
      id: `activity-${Date.now().toString(36)}c`,
      at: now,
      by,
      action: 'PROJECT_SHARED_WITH_USER',
      detail: `Project shared with ${body.shareWith}.`,
    });
  }
  if (body.unshareWith) {
    activityEntries.push({
      id: `activity-${Date.now().toString(36)}d`,
      at: now,
      by,
      action: 'PROJECT_UNSHARED_FROM_USER',
      detail: `Access revoked for ${body.unshareWith}.`,
    });
  }

  const project: StoredProject = {
    ...existing,
    status: updatedStatus,
    global: updatedGlobal,
    sharedWith: updatedSharedWith,
    updatedAt: now,
    revision: existing.revision + 1,
    activity: [...activityEntries, ...existing.activity],
  };

  await saveStoredProject(project);
  return NextResponse.json({ project });
}

export async function DELETE(_: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await loadStoredProject(id);
  const perms = existing ? getEffectivePermissions(existing, session.user.id, session.user.email ?? undefined) : null;

  if (!existing || !perms!.read) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }
  if (!perms!.admin) {
    return NextResponse.json({ error: 'Only the project owner can delete it.' }, { status: 403 });
  }

  const ok = await deleteStoredProject(id);
  if (!ok) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
