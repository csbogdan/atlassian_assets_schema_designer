import { NextResponse } from 'next/server';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { auth } from '@/lib/auth';

const STORAGE_DIR = path.join(process.cwd(), '.jsm-projects');

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminKey = process.env.ADMIN_KEY;
  const provided = request.headers.get('x-admin-key');
  if (!adminKey || provided !== adminKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { userId } = await request.json() as { userId?: string };
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  let files: string[];
  try {
    files = (await readdir(STORAGE_DIR)).filter((f) => f.endsWith('.json'));
  } catch {
    return NextResponse.json({ claimed: 0, skipped: 0, names: [] });
  }

  let claimed = 0;
  let skipped = 0;
  const names: string[] = [];

  for (const file of files) {
    const filePath = path.join(STORAGE_DIR, file);
    const project = JSON.parse(await readFile(filePath, 'utf8'));
    if (project.ownerId) { skipped++; continue; }
    project.ownerId = userId;
    project.global = project.global ?? false;
    await writeFile(filePath, JSON.stringify(project, null, 2), 'utf8');
    names.push(project.name);
    claimed++;
  }

  return NextResponse.json({ claimed, skipped, names });
}
