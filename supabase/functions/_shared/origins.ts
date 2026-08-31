/**
 * Whether a browser origin is on the allowlist.
 *
 * Deliberately its own module with no Deno globals in it. `cors.ts` reads `ALLOWED_ORIGINS` from
 * the environment and is therefore Deno's alone; this half is plain TypeScript, so
 * `tests/unit/cors.test.ts` can import and exercise it in Node — which matters, because it is the
 * thing standing between a shared provider key and anyone who fancies a free study-guide API.
 */

/**
 * An entry may start with `*.` to allow a whole subdomain. That is not decoration: every pull
 * request gets its own preview at `https://pr-<n>-lumen.<host>`, and a phase is not finished until
 * that preview has been checked. Without it the choice is an allowlist edited per pull request, or
 * no allowlist in production.
 *
 * The comparison is against the parsed **host**, never the raw string. A suffix check on the
 * origin itself is satisfied by `https://evil.com/?x=.example.com`, and `endsWith` alone would
 * accept `https://notexample.com` for `*.example.com`.
 */
export function originAllowed(origin: string, allowed: string[]): boolean {
  if (allowed.includes(origin)) return true;

  let host: string;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    host = url.host;
  } catch {
    return false;
  }

  return allowed.some((entry) => {
    if (!entry.startsWith('*.')) return false;
    const suffix = entry.slice(1); // ".example.com"
    return host.endsWith(suffix) && host.length > suffix.length;
  });
}
