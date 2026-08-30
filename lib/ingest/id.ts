/**
 * Ids for blocks, assets, sources and drafts.
 *
 * `crypto.randomUUID` needs a secure context, which every browser we ship to has and which the
 * unit tests under node do too — but a http:// origin on a phone on the school wifi does not, and
 * an ingestion that throws there would be indistinguishable from a corrupt file. So: try it, fall
 * back to `getRandomValues`, and only then to `Math.random`. Ids are local keys, not secrets.
 */
export function newId(prefix: string): string {
  return `${prefix}_${randomToken()}`;
}

function randomToken(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID().replace(/-/g, '').slice(0, 16);
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = c.getRandomValues(new Uint8Array(8));
    return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(16).slice(2, 10) + Math.random().toString(16).slice(2, 10);
}
