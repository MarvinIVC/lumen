/**
 * drive-auth — Google Drive OAuth callback (02-ARCHITECTURE.md §4 integration).
 *
 * Stub: returns 501 until phase-07 implements it.
 */
import { notImplemented, serve } from '../_shared/response.ts';

const TODO =
  'Verify state, exchange the code with GOOGLE_OAUTH_CLIENT_ID/SECRET, encrypt and store the refresh token, record the target folder in integration.meta.';

serve((request) => notImplemented(request, 'drive-auth', TODO, 'phase-07'));
