import { Pool } from 'pg';

export interface User {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string;
  failedAttempts: number;
  lockedUntil: Date | null;
  lastLogin: Date | null;
  createdAt: Date;
}

let pool: Pool | null = null;

function buildSslConfig(): false | { rejectUnauthorized: boolean; ca?: string } {
  if (process.env.NODE_ENV !== 'production') {
    // Development: no TLS unless DATABASE_URL already uses sslmode
    return false;
  }
  // Production: use CA cert if provided (secure default)
  if (process.env.DATABASE_CA_CERT) {
    return { rejectUnauthorized: true, ca: process.env.DATABASE_CA_CERT };
  }
  // Explicit opt-out for managed services with self-signed certs (e.g., Azure Database for PostgreSQL
  // Flexible Server without custom CA download). Set SQL_TLS_REJECT_UNAUTHORIZED=false to enable.
  if (process.env.SQL_TLS_REJECT_UNAUTHORIZED === 'false') {
    return { rejectUnauthorized: false };
  }
  // Secure production default: TLS enabled, certificate verification required
  return { rejectUnauthorized: true };
}

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: buildSslConfig(),
    });
  }
  return pool;
}

export async function initDb(): Promise<void> {
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      password_hash TEXT NOT NULL,
      failed_attempts INT NOT NULL DEFAULT 0,
      locked_until TIMESTAMPTZ,
      last_login TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Version index — one row per save, points to the JSON snapshot on disk
  await db.query(`
    CREATE TABLE IF NOT EXISTS project_versions (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id  TEXT NOT NULL,
      revision    INT  NOT NULL,
      snapshot_path TEXT NOT NULL,
      label       TEXT,
      changed_by  TEXT,
      change_count INT NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS project_versions_project_id_idx
    ON project_versions (project_id, revision DESC)
  `);

  // Field-level change log — one row per changed field per save
  await db.query(`
    CREATE TABLE IF NOT EXISTS change_log (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id  TEXT NOT NULL,
      version_id  UUID NOT NULL REFERENCES project_versions(id) ON DELETE CASCADE,
      path        TEXT NOT NULL,
      old_value   JSONB,
      new_value   JSONB,
      changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      changed_by  TEXT
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS change_log_project_path_idx
    ON change_log (project_id, path, changed_at DESC)
  `);
}

// ── changelog functions ───────────────────────────────────────────────────────

import type { ChangeEvent } from '@/lib/documentDiff';

export type ChangeLogRow = {
  id: string;
  projectId: string;
  versionId: string;
  revision: number;
  path: string;
  oldValue: unknown;
  newValue: unknown;
  changedAt: Date;
  changedBy: string | null;
  label: string | null;
};

/** Record a save: inserts one project_versions row + N change_log rows. Fire-and-forget safe. */
export async function recordProjectSave(opts: {
  projectId: string;
  revision: number;
  snapshotPath: string;
  changedBy: string | null;
  label?: string;
  changes: ChangeEvent[];
}): Promise<void> {
  const db = getPool();
  const versionResult = await db.query<{ id: string }>(
    `INSERT INTO project_versions (project_id, revision, snapshot_path, label, changed_by, change_count)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [opts.projectId, opts.revision, opts.snapshotPath, opts.label ?? null, opts.changedBy, opts.changes.length],
  );
  const versionId = versionResult.rows[0].id;

  if (opts.changes.length === 0) return;

  // Bulk-insert change rows
  const values: unknown[] = [];
  const placeholders = opts.changes.map((c, i) => {
    const base = i * 5;
    values.push(opts.projectId, versionId, c.path, JSON.stringify(c.oldValue ?? null), JSON.stringify(c.newValue ?? null));
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::jsonb, $${base + 5}::jsonb)`;
  }).join(', ');

  await db.query(
    `INSERT INTO change_log (project_id, version_id, path, old_value, new_value)
     VALUES ${placeholders}`,
    values,
  );
}

/** Return recent change log for a project, optionally filtered by path prefix. */
export async function getProjectChangeLog(opts: {
  projectId: string;
  path?: string;
  limit?: number;
  offset?: number;
}): Promise<ChangeLogRow[]> {
  const db = getPool();
  const limit = Math.min(opts.limit ?? 100, 500);
  const offset = opts.offset ?? 0;

  const result = await db.query<{
    id: string; project_id: string; version_id: string; revision: number;
    path: string; old_value: unknown; new_value: unknown;
    changed_at: Date; changed_by: string | null; label: string | null;
  }>(
    `SELECT cl.id, cl.project_id, cl.version_id, pv.revision,
            cl.path, cl.old_value, cl.new_value,
            cl.changed_at, cl.changed_by, pv.label
     FROM change_log cl
     JOIN project_versions pv ON pv.id = cl.version_id
     WHERE cl.project_id = $1
       ${opts.path ? 'AND cl.path LIKE $4' : ''}
     ORDER BY cl.changed_at DESC
     LIMIT $2 OFFSET $3`,
    opts.path
      ? [opts.projectId, limit, offset, `${opts.path}%`]
      : [opts.projectId, limit, offset],
  );

  return result.rows.map((r) => ({
    id: r.id,
    projectId: r.project_id,
    versionId: r.version_id,
    revision: r.revision,
    path: r.path,
    oldValue: r.old_value,
    newValue: r.new_value,
    changedAt: r.changed_at,
    changedBy: r.changed_by,
    label: r.label,
  }));
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const db = getPool();
  const result = await db.query<{
    id: string;
    email: string;
    name: string | null;
    password_hash: string;
    failed_attempts: number;
    locked_until: Date | null;
    last_login: Date | null;
    created_at: Date;
  }>(
    `SELECT id, email, name, password_hash, failed_attempts, locked_until, last_login, created_at
     FROM users
     WHERE email = $1`,
    [email.toLowerCase()],
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    failedAttempts: row.failed_attempts,
    lockedUntil: row.locked_until,
    lastLogin: row.last_login,
    createdAt: row.created_at,
  };
}

export async function recordSuccessfulLogin(userId: string): Promise<void> {
  const db = getPool();
  await db.query(
    `UPDATE users
     SET failed_attempts = 0,
         locked_until = NULL,
         last_login = NOW()
     WHERE id = $1`,
    [userId],
  );
}

export async function recordFailedLogin(userId: string): Promise<void> {
  const db = getPool();
  await db.query(
    `UPDATE users
     SET failed_attempts = failed_attempts + 1,
         locked_until = CASE
           WHEN failed_attempts + 1 >= 10 THEN NOW() + INTERVAL '15 minutes'
           ELSE locked_until
         END
     WHERE id = $1`,
    [userId],
  );
}
