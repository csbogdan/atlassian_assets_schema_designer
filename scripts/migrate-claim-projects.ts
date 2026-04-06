#!/usr/bin/env node
/**
 * One-off migration: assign ownerId to all project files that have none.
 * Usage: npx tsx scripts/migrate-claim-projects.ts <user-email>
 *
 * Looks up the user by email, then stamps their id onto every project
 * file that currently has no ownerId.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';

const STORAGE_DIR = path.join(process.cwd(), '.jsm-projects');

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npx tsx scripts/migrate-claim-projects.ts <user-email>');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  const { rows } = await pool.query<{ id: string; email: string }>(
    'SELECT id, email FROM users WHERE email = $1',
    [email.toLowerCase()],
  );
  await pool.end();

  if (!rows[0]) {
    console.error(`No user found with email "${email}"`);
    process.exit(1);
  }

  const user = rows[0];
  const files = (await readdir(STORAGE_DIR)).filter((f) => f.endsWith('.json'));

  let claimed = 0;
  let skipped = 0;

  for (const file of files) {
    const filePath = path.join(STORAGE_DIR, file);
    const project = JSON.parse(await readFile(filePath, 'utf8'));

    if (project.ownerId) {
      skipped++;
      continue;
    }

    project.ownerId = user.id;
    project.global = project.global ?? false;
    await writeFile(filePath, JSON.stringify(project, null, 2), 'utf8');
    console.log(`  ✓ Claimed: ${project.name} (${project.id})`);
    claimed++;
  }

  console.log(`\nDone — ${claimed} claimed, ${skipped} already owned.`);
}

main().catch(console.error);
