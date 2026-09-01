import { requireSupabaseUser } from '@/lib/supabase/require-user.server';

export async function GET(request: Request) {
  const auth = await requireSupabaseUser();
  if (!auth) return Response.json({ ids: [] }, { status: 401 });
  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (!query) return Response.json({ ids: [] });
  const result = await auth.supabase.rpc('search_notes', { p_query: query, p_limit: 100 });
  if (result.error) return Response.json({ error: 'search_failed' }, { status: 500 });
  const rows = Array.isArray(result.data) ? result.data : [];
  return Response.json({ ids: rows.map((row) => row.note_id) });
}
