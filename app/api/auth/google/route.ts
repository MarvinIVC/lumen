import { safeAppNext } from '@/lib/auth/safe-next';
import { clientEnv } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server.server';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { next?: unknown } | null;
  const next = safeAppNext(typeof body?.next === 'string' ? body.next : null);
  const callback = new URL('/auth/callback', clientEnv.NEXT_PUBLIC_APP_URL);
  callback.searchParams.set('next', next);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: callback.toString(), skipBrowserRedirect: true },
  });

  if (error || !data.url) return Response.json({ error: 'sign_in_failed' }, { status: 400 });
  return Response.json({ url: data.url }, { headers: { 'cache-control': 'no-store' } });
}
