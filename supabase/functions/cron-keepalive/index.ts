/**
 * cron-keepalive — weekly ping so the free Supabase project never idles into a pause (02-ARCHITECTURE.md §2).
 *
 * Stub: returns 501 until phase-06 implements it.
 */
import { notImplemented, serve } from '../_shared/response.ts';

const TODO =
  'Run a trivial query against app_config and return ok. Wire a Cloudflare cron trigger to hit this weekly once the project is deployed.';

serve((request) => notImplemented(request, 'cron-keepalive', TODO, 'phase-06'));
