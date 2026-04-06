import 'server-only';

import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AssetsImportDocument, ProjectEnvironment, ProjectSettings } from '@/domain/model/types';
import type { ProjectActivity, ProjectVersion } from '@/stores/documentStore';

export type StoredProject = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  status: 'open' | 'closed' | 'archived';
  /** UUID of the user who created the project. Absent on projects created before auth was added. */
  ownerId?: string;
  /** When true the project is visible and editable by all authenticated users. */
  global: boolean;
  document: AssetsImportDocument;
  versions: ProjectVersion[];
  baselines: ProjectVersion[];
  activity: ProjectActivity[];
  validationConfig?: Record<string, boolean>;
  projectSettings?: ProjectSettings;
  /** Emails of specific users granted read access (in addition to global flag). */
  sharedWith?: string[];
  /** externalIds of object types soft-deleted (staged for removal). Not included in export/validation. */
  stagedForDeletion?: string[];
  /** Named push environments (name + Bearer token). Follows project sharing. */
  environments?: ProjectEnvironment[];
};

export type ProjectSummary = {
  id: string;
  name: string;
  updatedAt: string;
  revision: number;
  status: 'open' | 'closed' | 'archived';
  ownerId?: string;
  global: boolean;
  /** Present only for the project owner — the list of email addresses with explicit read access. */
  sharedWith?: string[];
};

const STORAGE_DIR = path.join(process.cwd(), '.jsm-projects');

/** Allow only alphanumerics, hyphens, and underscores so IDs can never escape the storage dir. */
function isSafeProjectId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

async function ensureStorageDir() {
  await mkdir(STORAGE_DIR, { recursive: true });
}

function getProjectFilePath(id: string): string {
  return path.join(STORAGE_DIR, `${id}.json`);
}

function assertSafeId(id: string): void {
  if (!isSafeProjectId(id)) {
    throw new Error(`Invalid project id: "${id}"`);
  }
}

/** Returns all projects visible to the given user: their own + global + legacy (no ownerId) + explicitly shared. */
export async function listStoredProjectsForUser(userId: string, currentUserEmail?: string): Promise<ProjectSummary[]> {
  await ensureStorageDir();
  const files = (await readdir(STORAGE_DIR)).filter((file) => file.endsWith('.json'));

  const all = await Promise.all(files.map(async (file) => {
    const fullPath = path.join(STORAGE_DIR, file);
    const content = await readFile(fullPath, 'utf8');
    const parsed = JSON.parse(content) as StoredProject;
    const fileStat = await stat(fullPath);

    return {
      id: parsed.id,
      name: parsed.name,
      revision: parsed.revision,
      status: parsed.status,
      ownerId: parsed.ownerId,
      global: parsed.global ?? false,
      updatedAt: parsed.updatedAt || fileStat.mtime.toISOString(),
      sharedWith: parsed.sharedWith,
    };
  }));

  // Only show projects the user owns or has been explicitly granted access to.
  // Unclaimed projects (no ownerId) are hidden — use POST /api/admin/claim-projects
  // to assign ownership before they appear in any user's list.
  const visible = all.filter(
    (p) => p.ownerId === userId || p.global || (currentUserEmail && p.sharedWith?.includes(currentUserEmail)),
  );

  return visible
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .map(({ sharedWith, ...summary }): ProjectSummary => {
      // Only expose the sharedWith list to the project owner.
      const isOwner = summary.ownerId === userId;
      return isOwner && sharedWith?.length
        ? { ...summary, sharedWith }
        : summary;
    });
}

export async function loadStoredProject(id: string): Promise<StoredProject | null> {
  assertSafeId(id);
  await ensureStorageDir();
  const filePath = getProjectFilePath(id);

  try {
    const content = await readFile(filePath, 'utf8');
    return JSON.parse(content) as StoredProject;
  } catch {
    return null;
  }
}

export async function saveStoredProject(project: StoredProject): Promise<void> {
  assertSafeId(project.id);
  await ensureStorageDir();
  const filePath = getProjectFilePath(project.id);
  await writeFile(filePath, JSON.stringify(project, null, 2), 'utf8');
}

export async function deleteStoredProject(id: string): Promise<boolean> {
  assertSafeId(id);
  await ensureStorageDir();
  const filePath = getProjectFilePath(id);

  try {
    await rm(filePath);
    return true;
  } catch {
    return false;
  }
}
