import { createSupabaseServerClient } from '@/lib/supabase/server.server';

export async function POST() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
}
