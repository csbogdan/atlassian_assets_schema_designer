'use server';

import { signIn } from '@/lib/auth';
import { AuthError } from 'next-auth';

export async function loginAction(
  _prevState: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  try {
    await signIn('credentials', {
      email: formData.get('email') as string,
      password: formData.get('password') as string,
      redirectTo: (formData.get('callbackUrl') as string) || '/',
    });
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.type === 'CredentialsSignin') {
        return { error: 'Invalid email or password.' };
      }
      return {
        error: error.message.split('.')[0] || 'Authentication failed.',
      };
    }
    // NEXT_REDIRECT must be re-thrown so Next.js can handle the redirect.
    throw error;
  }
  return null;
}
