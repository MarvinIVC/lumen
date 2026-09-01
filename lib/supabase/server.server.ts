import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { clientEnv } from '@/lib/env';

/**
 * A request-scoped Supabase client whose session never becomes browser-readable.
 *
 * `@supabase/ssr` defaults to cookies JavaScript can read because its normal browser client
 * refreshes its own token. Lumen deliberately has no authenticated browser Supabase client: the
 * same-origin handlers below do the refresh and every cookie they write is httpOnly.
 */
export async function createSupabaseServerClient(options: { writeCookies?: boolean } = {}) {
  const cookieStore = await cookies();
  const writeCookies = options.writeCookies ?? true;

  return createServerClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookieOptions: {
        path: '/',
        sameSite: 'lax',
        secure: clientEnv.NEXT_PUBLIC_ENV !== 'local',
        httpOnly: true,
      },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (entries) => {
          if (!writeCookies) return;
          for (const { name, value, options: cookieOptions } of entries) {
            cookieStore.set(name, value, {
              ...cookieOptions,
              path: '/',
              sameSite: 'lax',
              secure: clientEnv.NEXT_PUBLIC_ENV !== 'local',
              httpOnly: true,
            });
          }
        },
      },
    },
  );
}

export interface SessionUser {
  id: string;
  email: string;
  emailConfirmed: boolean;
  displayName: string | null;
}

export function toSessionUser(user: {
  id: string;
  email?: string;
  email_confirmed_at?: string;
  user_metadata?: Record<string, unknown>;
}): SessionUser | null {
  if (!user.email) return null;
  const name = user.user_metadata?.full_name ?? user.user_metadata?.name;
  return {
    id: user.id,
    email: user.email,
    emailConfirmed: Boolean(user.email_confirmed_at),
    displayName: typeof name === 'string' && name.trim() ? name.trim() : null,
  };
}
