import type { StoredProject } from '@/lib/projectsRepository';

export interface EffectivePermissions {
  read: boolean;
  write: boolean;
  admin: boolean;
}

/**
 * Single source of truth for project access control.
 *
 * Projects without an ownerId are unclaimed legacy projects — they are not
 * accessible to any user until claimed via POST /api/admin/claim-projects.
 *
 * Global projects are read-only for non-owners. Only the owner can write or
 * perform admin actions (share, delete, rename).
 *
 * Explicitly shared projects (sharedWith contains the user's email) grant read-only access.
 */
export function getEffectivePermissions(
  project: Pick<StoredProject, 'ownerId' | 'global' | 'sharedWith'>,
  userId: string,
  currentUserEmail?: string,
): EffectivePermissions {
  const isOwned = project.ownerId === userId;
  const isGlobal = project.global === true;
  const isShared = Boolean(currentUserEmail && project.sharedWith?.includes(currentUserEmail));

  const read = isOwned || isGlobal || isShared;
  const write = isOwned || isShared;
  const admin = isOwned;

  return { read, write, admin };
}
