import { requireSupabaseUser } from '@/lib/supabase/require-user.server';

export const dynamic = 'force-dynamic';

/**
 * Incremental by default.
 *
 * The client pulls on reconnect, on focus and once a minute. Returning every row each time means
 * re-downloading every document blob a student owns for as long as a tab is open, which is the
 * kind of egress the free tier is metered on. `since` narrows the rows to what changed.
 *
 * The note *ids* are always returned in full, though, and cheaply: a note deleted on another
 * device is invisible in a changed-rows query, so the mirror could only ever grow.
 */
const OVERLAP_MS = 60_000;

export async function GET(request: Request) {
  const auth = await requireSupabaseUser();
  if (!auth) return Response.json({ error: 'unauthorized' }, { status: 401 });

  // The window is widened by a minute because `pulledAt` is this Worker's clock and `updated_at`
  // is Postgres's. Re-sending a row the browser already has is free; missing one is a lost edit.
  const asked = Date.parse(new URL(request.url).searchParams.get('since') ?? '');
  const since = Number.isFinite(asked) ? new Date(asked - OVERLAP_MS).toISOString() : null;
  const changed = <T extends { gt: (column: string, value: string) => T }>(query: T): T =>
    since ? query.gt('updated_at', since) : query;

  const [courses, units, notes, ids] = await Promise.all([
    changed(auth.supabase.from('course').select('*')).order('ordinal').order('created_at'),
    changed(auth.supabase.from('unit').select('*')).order('ordinal').order('created_at'),
    changed(auth.supabase.from('note').select('*')).order('updated_at', { ascending: false }),
    auth.supabase.from('note').select('id'),
  ]);
  const error = courses.error ?? units.error ?? notes.error ?? ids.error;
  if (error) return Response.json({ error: 'pull_failed' }, { status: 500 });

  return Response.json(
    {
      courses: courses.data,
      units: units.data,
      notes: notes.data,
      noteIds: (ids.data ?? []).map((row) => row.id),
      pulledAt: new Date().toISOString(),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
