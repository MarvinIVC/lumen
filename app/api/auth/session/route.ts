import { createSupabaseServerClient, toSessionUser } from '@/lib/supabase/server.server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return Response.json(
    { user: user ? toSessionUser(user) : null },
    { headers: { 'cache-control': 'no-store' } },
  );
}
