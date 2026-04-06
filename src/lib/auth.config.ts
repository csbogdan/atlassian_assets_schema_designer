import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-safe auth config — no Node.js imports (no pg, no bcrypt).
 * Used by middleware (Edge runtime) and extended by the full auth config.
 */
export const authConfig: NextAuthConfig = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      return session;
    },
  },
  providers: [], // Credentials provider added in auth.ts (Node.js only)
};
