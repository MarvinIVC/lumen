/** Weekly authenticated no-op that records real database activity and prevents project pausing. */
import { error, json, serve } from '../_shared/response.ts';
import { isConfigured, select } from '../_shared/db.ts';

serve(async (request) => {
  const expected = Deno.env.get('KEEPALIVE_SECRET');
  if (!expected || request.headers.get('x-keepalive-secret') !== expected) {
    return error(request, 'unauthorized', 'Keep-alive secret required.', 401);
  }
  if (!isConfigured()) return error(request, 'not_configured', 'Database is not configured.', 500);
  const rows = await select<{ key: string }>('app_config?select=key&limit=1');
  return json(request, {
    ok: true,
    databaseReached: rows.length > 0,
    checkedAt: new Date().toISOString(),
  });
});
