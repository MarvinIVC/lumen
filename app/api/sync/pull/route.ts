import { requireSupabaseUser } from '@/lib/supabase/require-user.server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireSupabaseUser();
  if (!auth) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const [courses, units, notes] = await Promise.all([
    auth.supabase.from('course').select('*').order('ordinal').order('created_at'),
    auth.supabase.from('unit').select('*').order('ordinal').order('created_at'),
    auth.supabase.from('note').select('*').order('updated_at', { ascending: false }),
  ]);
  const error = courses.error ?? units.error ?? notes.error;
  if (error) return Response.json({ error: 'pull_failed' }, { status: 500 });

  return Response.json(
    {
      courses: courses.data,
      units: units.data,
      notes: notes.data,
      pulledAt: new Date().toISOString(),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
