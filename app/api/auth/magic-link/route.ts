import { z } from 'zod';

import { safeAppNext } from '@/lib/auth/safe-next';
import { clientEnv } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server.server';

const Body = z.object({ email: z.email(), next: z.string().optional() });

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'invalid_email' }, { status: 400 });

  const next = safeAppNext(parsed.data.next);
  const callback = new URL('/auth/callback', clientEnv.NEXT_PUBLIC_APP_URL);
  callback.searchParams.set('next', next);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { shouldCreateUser: true, emailRedirectTo: callback.toString() },
  });

  if (error) return Response.json({ error: 'sign_in_failed' }, { status: 400 });
  return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
}
