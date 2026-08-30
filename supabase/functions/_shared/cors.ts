/**
 * CORS for the browser-facing functions. The app is served from Cloudflare and the functions from
 * Supabase, so every call is cross-origin.
 *
 * ALLOWED_ORIGINS is read from the function secret of the same name (comma-separated). When it is
 * unset — local development — any origin is allowed, because there is nothing to protect yet.
 */
const configured = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export function allowedOrigin(request: Request): string {
  const origin = request.headers.get('origin');
  if (configured.length === 0) return origin ?? '*';
  return origin && configured.includes(origin) ? origin : configured[0];
}

export function corsHeaders(request: Request): Record<string, string> {
  return {
    'access-control-allow-origin': allowedOrigin(request),
    'access-control-allow-headers':
      'authorization, x-client-info, apikey, content-type, x-lumen-anon-id',
    // The signed anon id is minted server-side on a student's first call and replayed by the
    // browser on every one after it. Without this the client cannot read the header it was issued
    // in, and every call would look like a new browser to the quota.
    'access-control-expose-headers': 'x-lumen-anon-id',
    'access-control-allow-methods': 'POST, GET, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}
