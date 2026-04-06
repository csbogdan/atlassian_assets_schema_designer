import { auth, signOut } from '@/lib/auth';

export async function UserMenu() {
  const session = await auth();
  if (!session) return null;

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-gray-400">{session.user?.email}</span>
      <form
        action={async () => {
          'use server';
          await signOut({ redirectTo: '/login' });
        }}
      >
        <button
          type="submit"
          className="px-3 py-1 rounded-md bg-[#161b22] border border-[#30363d] text-gray-300 hover:text-white hover:border-[#0052CC] transition-colors text-xs"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
