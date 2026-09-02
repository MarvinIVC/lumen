/**
 * notion-oauth — the Notion OAuth callback (06 §3).
 *
 * The student is sent here by Notion with a `code` and the `state` our own app minted. This
 * function is on the Supabase origin and cannot see the app's httpOnly session, so `state` is the
 * only thing that says who the code belongs to — see `_shared/oauth-state.ts`. It is verified
 * before anything is stored, and an unsigned or expired one is refused outright.
 *
 * Every exit is a redirect back into the app with a short status, because the student is sitting
 * in front of a browser tab that Notion just navigated: a JSON error here is a dead end.
 */
import { verifyState } from '../_shared/oauth-state.ts';
import { callbackUrl, saveIntegration, siteUrl } from '../_shared/integrations.ts';
import { serve } from '../_shared/response.ts';

const TOKEN_URL = 'https://api.notion.com/v1/oauth/token';

function back(next: string, status: string): Response {
  const url = new URL(next.startsWith('/') ? `${siteUrl()}${next}` : `${siteUrl()}/app`);
  url.searchParams.set('notion', status);
  return Response.redirect(url.toString(), 303);
}

serve(async (request) => {
  const url = new URL(request.url);
  const state = await verifyState(url.searchParams.get('state'));

  // Nothing to trust and nowhere specific to go: an unverifiable state is the one case where the
  // student cannot even be returned to the page they started from.
  if (!state) return back('/app/settings', 'state_invalid');

  // Notion sends `error=access_denied` when the student presses Cancel, which is not a failure.
  const denied = url.searchParams.get('error');
  if (denied) return back(state.next, denied === 'access_denied' ? 'cancelled' : 'failed');

  const code = url.searchParams.get('code');
  if (!code) return back(state.next, 'failed');

  const id = Deno.env.get('NOTION_OAUTH_CLIENT_ID') ?? '';
  const secret = Deno.env.get('NOTION_OAUTH_CLIENT_SECRET') ?? '';
  if (!id || !secret) return back(state.next, 'not_configured');

  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        // Notion's token endpoint is HTTP Basic with the client id and secret, not a body field.
        authorization: `Basic ${btoa(`${id}:${secret}`)}`,
        'content-type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl('notion-oauth'),
      }),
    });

    if (!response.ok) return back(state.next, 'exchange_failed');

    const token = (await response.json()) as {
      access_token?: string;
      workspace_name?: string;
      workspace_id?: string;
      bot_id?: string;
    };
    if (!token.access_token) return back(state.next, 'exchange_failed');

    await saveIntegration({
      owner: state.userId,
      kind: 'notion',
      accessToken: token.access_token,
      // Notion's tokens do not expire and there is no refresh token; a revoked one simply starts
      // failing, which is what `markRevoked` is for.
      accountLabel: token.workspace_name ?? null,
      meta: { workspaceId: token.workspace_id ?? null, botId: token.bot_id ?? null, courses: {} },
    });

    return back(state.next, 'connected');
  } catch {
    return back(state.next, 'failed');
  }
});
