import { redirect } from 'next/navigation';

import { clientEnv } from '@/lib/env';
import { serverEnv } from '@/lib/env.server';
import { safeAppNext } from '@/lib/auth/safe-next';
import { mintState } from '@/lib/integrations/oauth-state.server';
import { requireSupabaseUser } from '@/lib/supabase/require-user.server';

export const dynamic = 'force-dynamic';

/**
 * Starts an OAuth flow (06 §3).
 *
 * This route exists because of where the session lives. The callback is a Supabase edge function
 * on another origin and cannot read the app's httpOnly cookies, so it has no way to know who the
 * returning `code` belongs to. Here, on our own origin, the session *is* legible — so the user id
 * is signed into the `state` parameter and travels with the redirect.
 *
 * `safeAppNext` decides where the student comes back to, exactly as the auth callbacks do: a
 * `next` that is not an in-app path is replaced rather than followed.
 */
const SCOPES = {
  // Only files this app creates. It cannot see, list or touch anything else in a student's Drive —
  // which is also why the destination folder is one Lumen makes. See `drive-push`.
  drive: 'https://www.googleapis.com/auth/drive.file',
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider');
  const next = safeAppNext(url.searchParams.get('next'));

  if (provider !== 'notion' && provider !== 'drive') {
    return Response.json({ error: 'unknown_provider' }, { status: 400 });
  }

  const session = await requireSupabaseUser();
  if (!session) return Response.json({ error: 'signed_out' }, { status: 401 });

  const state = mintState({ userId: session.user.id, provider, next });
  const callback = new URL(
    `/functions/v1/${provider === 'notion' ? 'notion-oauth' : 'drive-auth'}`,
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
  ).toString();

  if (provider === 'notion') {
    const id = serverEnv().NOTION_OAUTH_CLIENT_ID;
    if (!id) return Response.json({ error: 'not_configured' }, { status: 501 });

    const authorize = new URL('https://api.notion.com/v1/oauth/authorize');
    authorize.searchParams.set('client_id', id);
    authorize.searchParams.set('response_type', 'code');
    authorize.searchParams.set('owner', 'user');
    authorize.searchParams.set('redirect_uri', callback);
    authorize.searchParams.set('state', state);
    redirect(authorize.toString());
  }

  const id = serverEnv().GOOGLE_DRIVE_OAUTH_CLIENT_ID;
  if (!id) return Response.json({ error: 'not_configured' }, { status: 501 });

  const authorize = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorize.searchParams.set('client_id', id);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('redirect_uri', callback);
  authorize.searchParams.set('scope', SCOPES.drive);
  authorize.searchParams.set('state', state);
  // Google issues a refresh token only on the first consent, and only when asked offline. Without
  // both of these a student's connection stops working an hour after they made it, which looks
  // like the integration being broken rather than a token expiring.
  authorize.searchParams.set('access_type', 'offline');
  authorize.searchParams.set('prompt', 'consent');
  redirect(authorize.toString());
}
