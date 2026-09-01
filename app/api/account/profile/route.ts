import { z } from 'zod';

import { requireSupabaseUser } from '@/lib/supabase/require-user.server';

const Prefs = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  defaults: z
    .object({
      mode: z.enum(['tidy', 'complete', 'study_guide']),
      depth: z.enum(['brief', 'match', 'thorough']),
      visuals: z.enum(['none', 'auto', 'more']),
      voice: z.enum(['keep-mine', 'textbook']),
    })
    .optional(),
});

export async function GET() {
  const auth = await requireSupabaseUser();
  if (!auth) return Response.json({ profile: null }, { status: 401 });
  const result = await auth.supabase.from('profile').select('display_name,locale,prefs').single();
  if (result.error) return Response.json({ error: 'profile_failed' }, { status: 500 });
  return Response.json({ profile: result.data }, { headers: { 'cache-control': 'no-store' } });
}

export async function PATCH(request: Request) {
  const auth = await requireSupabaseUser();
  if (!auth) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = Prefs.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'invalid_prefs' }, { status: 400 });
  const current = await auth.supabase.from('profile').select('prefs').single();
  const prefs = {
    ...((current.data?.prefs as Record<string, unknown> | null) ?? {}),
    ...parsed.data,
  };
  const updated = await auth.supabase.from('profile').update({ prefs }).eq('id', auth.user.id);
  if (updated.error) return Response.json({ error: 'profile_failed' }, { status: 500 });
  return Response.json({ ok: true });
}
