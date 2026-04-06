import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getUserByEmail } from '@/lib/db';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { email?: string };
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ found: false, error: 'Invalid email format.' });
  }

  try {
    const user = await getUserByEmail(email);
    if (user) {
      return NextResponse.json({ found: true, userId: user.id });
    }
    return NextResponse.json({ found: false, error: 'No account found for that email. Ask them to create an account first.' });
  } catch {
    return NextResponse.json({ found: false, error: 'Could not look up account. Try again.' });
  }
}
