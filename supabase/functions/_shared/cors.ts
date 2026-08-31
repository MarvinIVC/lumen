/**
 * CORS for the browser-facing functions. The app is served from Cloudflare and the functions from
 * Supabase, so every call is cross-origin.
 *
 * `ALLOWED_ORIGINS` is a comma-separated list from the function secret of the same name. Unset —
 * local development — allows any origin, because there is nothing yet to protect.
 *
 * An entry may start with `*.` to allow a whole subdomain, which is not decoration: every pull
 * request gets its own preview at `https://pr-<n>-lumen.<host>`, and AGENTS.md is emphatic that a
 * phase is not finished until the *preview* has been checked. Without the wildcard the choice
 * would be between an allowlist that has to be edited per pull request and no allowlist at all.
 * The match is on the host only, after the scheme, so `*.example.com` cannot be satisfied by
 * `https://evil.com/?x=.example.com` or by `https://notexample.com`.
 */
import { originAllowed } from './origins.ts';

function configuredOrigins(): string[] {
  return (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function allowedOrigin(request: Request): string {
  const origin = request.headers.get('origin');
  const allowed = configuredOrigins();
  if (allowed.length === 0) return origin ?? '*';
  if (origin && originAllowed(origin, allowed)) return origin;
  // Answer with the first configured origin rather than the caller's: the browser then refuses
  // the response, which is the correct outcome, and we have not echoed an untrusted value back.
  return allowed[0] ?? '';
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
