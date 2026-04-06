#!/usr/bin/env node
/**
 * Interactive user management CLI.
 * Usage: DATABASE_URL="..." npx tsx scripts/manage-users.ts
 */
import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { initDb } from '../src/lib/db';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const rl = readline.createInterface({ input, output });

// ── Helpers ───────────────────────────────────────────────────────────────────

function hr() {
  console.log('─'.repeat(60));
}

async function prompt(question: string): Promise<string> {
  return (await rl.question(question)).trim();
}

async function promptPassword(): Promise<string> {
  // Hide input on supported terminals
  if (process.stdout.isTTY) {
    return new Promise((resolve) => {
      process.stdout.write('  Password: ');
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      let password = '';
      const onData = (ch: string) => {
        if (ch === '\r' || ch === '\n') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(password);
        } else if (ch === '\u0003') {
          process.exit();
        } else if (ch === '\u007f') {
          password = password.slice(0, -1);
        } else {
          password += ch;
        }
      };
      process.stdin.on('data', onData);
    });
  }
  return prompt('  Password: ');
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function listUsers(): Promise<void> {
  const { rows } = await pool.query<{
    email: string;
    name: string | null;
    failed_attempts: number;
    locked_until: Date | null;
    last_login: Date | null;
    created_at: Date;
  }>(`SELECT email, name, failed_attempts, locked_until, last_login, created_at
      FROM users ORDER BY created_at`);

  if (rows.length === 0) {
    console.log('\n  No users found.\n');
    return;
  }

  console.log('');
  console.log(
    '  ' +
    'Email'.padEnd(36) +
    'Name'.padEnd(20) +
    'Last login'.padEnd(22) +
    'Status'
  );
  hr();
  for (const r of rows) {
    const locked =
      r.locked_until && r.locked_until > new Date()
        ? `locked until ${r.locked_until.toUTCString()}`
        : r.failed_attempts > 0
        ? `${r.failed_attempts} failed attempt(s)`
        : 'ok';
    const lastLogin = r.last_login
      ? r.last_login.toISOString().replace('T', ' ').slice(0, 16)
      : 'never';
    console.log(
      '  ' +
      r.email.padEnd(36) +
      (r.name ?? '').padEnd(20) +
      lastLogin.padEnd(22) +
      locked
    );
  }
  console.log('');
}

async function createUser(): Promise<void> {
  console.log('');
  const email = await prompt('  Email:    ');
  const name  = await prompt('  Name:     ');
  const password = await promptPassword();

  if (!email || !password) {
    console.log('  Cancelled — email and password are required.\n');
    return;
  }
  if (password.length < 8) {
    console.log('  Password must be at least 8 characters.\n');
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  const { rows } = await pool.query<{ id: string; email: string }>(
    `INSERT INTO users (email, name, password_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET name = $2, password_hash = $3
     RETURNING id, email`,
    [email.toLowerCase(), name || email, hash],
  );
  console.log(`  ✓ User saved: ${rows[0].email} (${rows[0].id})\n`);
}

async function deleteUser(): Promise<void> {
  await listUsers();
  const email = await prompt('  Email to delete (blank to cancel): ');
  if (!email) {
    console.log('  Cancelled.\n');
    return;
  }
  const confirm = await prompt(`  Delete "${email}"? Type yes to confirm: `);
  if (confirm.toLowerCase() !== 'yes') {
    console.log('  Cancelled.\n');
    return;
  }
  const { rowCount } = await pool.query(
    'DELETE FROM users WHERE email = $1',
    [email.toLowerCase()],
  );
  if (rowCount && rowCount > 0) {
    console.log(`  ✓ Deleted ${email}\n`);
  } else {
    console.log(`  No user found with email "${email}"\n`);
  }
}

async function claimProjects(appUrl: string, adminKey: string): Promise<void> {
  await listUsers();
  const email = await prompt('  Claim all unowned projects for email (blank to cancel): ');
  if (!email) { console.log('  Cancelled.\n'); return; }

  const { rows } = await pool.query<{ id: string }>(
    'SELECT id FROM users WHERE email = $1',
    [email.toLowerCase()],
  );
  if (!rows[0]) { console.log(`  No user found with email "${email}"\n`); return; }

  const res = await fetch(`${appUrl}/api/admin/claim-projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-key': adminKey },
    body: JSON.stringify({ userId: rows[0].id }),
  });

  if (!res.ok) { console.log(`  Claim failed: ${res.status}\n`); return; }

  const { claimed, skipped, names } = await res.json() as { claimed: number; skipped: number; names: string[] };
  for (const name of names) console.log(`  ✓ Claimed: ${name}`);
  console.log(`\n  Done — ${claimed} claimed, ${skipped} already owned.\n`);
}

async function unlockUser(): Promise<void> {
  await listUsers();
  const email = await prompt('  Email to unlock (blank to cancel): ');
  if (!email) {
    console.log('  Cancelled.\n');
    return;
  }
  const { rowCount } = await pool.query(
    `UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE email = $1`,
    [email.toLowerCase()],
  );
  if (rowCount && rowCount > 0) {
    console.log(`  ✓ Unlocked ${email}\n`);
  } else {
    console.log(`  No user found with email "${email}"\n`);
  }
}

// ── Menu ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('Error: DATABASE_URL is not set.');
    process.exit(1);
  }

  const appUrl = (process.env.APP_URL ?? '').replace(/\/$/, '');
  const adminKey = process.env.ADMIN_KEY ?? '';
  if (!appUrl || !adminKey) {
    console.error('Error: APP_URL and ADMIN_KEY must be set.');
    process.exit(1);
  }

  await initDb();

  console.log('');
  console.log('  JSM Assets — User Management');
  console.log(`  App: ${appUrl}`);

  while (true) {
    hr();
    console.log('  1) List users');
    console.log('  2) Create / update user');
    console.log('  3) Delete user');
    console.log('  4) Unlock user');
    console.log('  5) Claim unowned projects');
    console.log('  6) Exit');
    hr();
    const choice = await prompt('  Choice: ');

    switch (choice) {
      case '1': await listUsers(); break;
      case '2': await createUser(); break;
      case '3': await deleteUser(); break;
      case '4': await unlockUser(); break;
      case '5': await claimProjects(appUrl, adminKey); break;
      case '6':
        rl.close();
        await pool.end();
        process.exit(0);
      default:
        console.log('  Invalid choice.\n');
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
