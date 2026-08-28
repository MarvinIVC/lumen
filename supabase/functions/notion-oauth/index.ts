/**
 * notion-oauth — Notion OAuth callback; exchanges the code and stores an encrypted token (02-ARCHITECTURE.md §4 integration).
 *
 * Stub: returns 501 until phase-07 implements it.
 */
import { notImplemented, serve } from '../_shared/response.ts';

const TODO =
  'Verify the state parameter, exchange the code with NOTION_OAUTH_CLIENT_ID/SECRET, encrypt the access token with BYOK_ENC_KEY, upsert into integration.';

serve((request) => notImplemented(request, 'notion-oauth', TODO, 'phase-07'));
