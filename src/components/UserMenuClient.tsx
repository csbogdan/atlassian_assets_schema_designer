'use client';

import { useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useDocumentStore } from '@/stores/documentStore';

export function UserMenuClient() {
  const { data: session } = useSession();
  const setCurrentUser = useDocumentStore((s) => s.setCurrentUser);

  useEffect(() => {
    setCurrentUser(session?.user?.email ?? undefined);
  }, [session?.user?.email, setCurrentUser]);

  if (!session) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-xs text-slate-500 sm:inline">
        {session.user?.email}
      </span>
      <button
        onClick={() => signOut({ callbackUrl: '/login' })}
        className="lozenge bg-slate-100 text-slate-600 hover:bg-slate-200"
        title="Sign out"
      >
        Sign out
      </button>
    </div>
  );
}
