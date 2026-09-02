/**
 * drive-auth — the Google Drive OAuth callback (06 §3).
 *
 * **A different Google Cloud project from the one that serves sign-in, and the env var is named
 * so nobody can wire the wrong one in.** The consent screen and its verification status are per
 * project, not per client: sign-in is publishable without review only because its screen asks for
 * nothing but `openid`, `userinfo.email` and `userinfo.profile`. `drive.file` is sensitive, so
 * adding it to that screen would put a flow that works today into Google's review queue and can
 * show every student an unverified-app warning. Phase-06 recorded that trap; this is it avoided.
 *
 * `drive.file` also means Lumen can only ever see files it created. That is the whole reason the
 * folder is Lumen's own — see `drive-push`.
 */
import { verifyState } from '../_shared/oauth-state.ts';
import { callbackUrl, saveIntegration, siteUrl } from '../_shared/integrations.ts';
import { serve } from '../_shared/response.ts';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function back(next: string, status: string): Response {
  const url = new URL(next.startsWith('/') ? `${siteUrl()}${next}` : `${siteUrl()}/app`);
  url.searchParams.set('drive', status);
  return Response.redirect(url.toString(), 303);
}

serve(async (request) => {
  const url = new URL(request.url);
  const state = await verifyState(url.searchParams.get('state'));
  if (!state) return back('/app/settings', 'state_invalid');

  const denied = url.searchParams.get('error');
  if (denied) return back(state.next, denied === 'access_denied' ? 'cancelled' : 'failed');

  const code = url.searchParams.get('code');
  if (!code) return back(state.next, 'failed');

  const id = Deno.env.get('GOOGLE_DRIVE_OAUTH_CLIENT_ID') ?? '';
  const secret = Deno.env.get('GOOGLE_DRIVE_OAUTH_CLIENT_SECRET') ?? '';
  if (!id || !secret) return back(state.next, 'not_configured');

  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: id,
        client_secret: secret,
        redirect_uri: callbackUrl('drive-auth'),
        grant_type: 'authorization_code',
      }),
    });
    if (!response.ok) return back(state.next, 'exchange_failed');

    const token = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!token.access_token) return back(state.next, 'exchange_failed');

    // Google returns a refresh token only on the first consent, so a reconnect can legitimately
    // arrive without one. Keeping the access token and expiry is still worth doing: the student
    // gets an hour of working pushes rather than an error, and `prompt=consent` on the start
    // route is what makes a real refresh token turn up when it is actually missing.
    await saveIntegration({
      owner: state.userId,
      kind: 'drive',
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresInSeconds: token.expires_in ?? 3600,
      meta: { folders: {} },
    });

    return back(state.next, 'connected');
  } catch {
    return back(state.next, 'failed');
  }
});
