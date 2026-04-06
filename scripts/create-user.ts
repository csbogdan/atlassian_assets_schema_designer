#!/usr/bin/env node
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { initDb } from '../src/lib/db';

async function main(): Promise<void> {
  const [email, name, password] = process.argv.slice(2);

  if (!email || !password) {
    console.error(
      'Usage: npx tsx scripts/create-user.ts <email> <name> <password>',
    );
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);

  // initDb creates the users table if it does not already exist.
  await initDb();

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
  });

  const { rows } = await pool.query<{ id: string; email: string; name: string | null }>(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET name = $2, password_hash = $3
     RETURNING id, email, name`,
    [email.toLowerCase(), name ?? email, hash],
  );

  console.log('User upserted:', rows[0]);
  await pool.end();
}

main().catch(console.error);
