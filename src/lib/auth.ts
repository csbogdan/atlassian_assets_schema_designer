import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import {
  getUserByEmail,
  recordSuccessfulLogin,
  recordFailedLogin,
} from '@/lib/db';
import { authConfig } from '@/lib/auth.config';

// Dummy hash used in the null-user path to ensure constant-time bcrypt
// comparison and prevent user enumeration via timing differences.
const DUMMY_HASH =
  '$2b$12$invalid.hash.for.timing.prevention.only.xxxxxxxxxxx';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (
          typeof credentials?.email !== 'string' ||
          typeof credentials?.password !== 'string'
        ) {
          return null;
        }

        const user = await getUserByEmail(credentials.email);

        if (!user) {
          await bcrypt.compare(credentials.password, DUMMY_HASH).catch(() => false);
          return null;
        }

        if (user.lockedUntil && user.lockedUntil > new Date()) {
          throw new Error(
            `Account locked until ${user.lockedUntil.toUTCString()}`,
          );
        }

        const passwordValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash,
        );

        if (!passwordValid) {
          await recordFailedLogin(user.id);
          return null;
        }

        await recordSuccessfulLogin(user.id);

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
        };
      },
    }),
  ],
});
