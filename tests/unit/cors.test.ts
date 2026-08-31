import { describe, expect, it } from 'vitest';

// `origins.ts` is the half of the CORS helper with no Deno globals in it, precisely so that it can
// be exercised here. `cors.ts`, which reads the environment, stays Deno's alone.
import { originAllowed } from '../../supabase/functions/_shared/origins.ts';

/**
 * The CORS allowlist (02-ARCHITECTURE.md §6).
 *
 * The app is on Cloudflare and the functions are on Supabase, so every call a student's browser
 * makes is cross-origin and this list is what stands between the shared provider key and anyone
 * who fancies a free study-guide API. The `*.` entry exists because every pull request gets its
 * own preview origin, and a phase is not finished until the preview has been checked.
 *
 * Matching on the parsed host rather than on the string is the whole point: a suffix check against
 * a raw origin is satisfied by `https://evil.com/?x=.example.com`.
 */
const ALLOWED = ['https://lumen.marvinmaiwang.workers.dev', '*.marvinmaiwang.workers.dev'];

describe('allowed', () => {
  it.each([
    ['https://lumen.marvinmaiwang.workers.dev', 'the exact production origin'],
    ['https://pr-7-lumen.marvinmaiwang.workers.dev', 'a pull-request preview'],
    ['https://pr-123-lumen.marvinmaiwang.workers.dev', 'a later preview'],
  ])('%s — %s', (origin) => {
    expect(originAllowed(origin, ALLOWED)).toBe(true);
  });
});

describe('refused', () => {
  it.each([
    ['https://marvinmaiwang.workers.dev', 'the bare domain does not match its own wildcard'],
    ['https://notmarvinmaiwang.workers.dev', 'a domain that merely ends the same way'],
    ['https://evil.com/?x=.marvinmaiwang.workers.dev', 'the suffix hidden in a query string'],
    ['https://evil.com#.marvinmaiwang.workers.dev', 'the suffix hidden in a fragment'],
    ['https://evil.com/.marvinmaiwang.workers.dev', 'the suffix hidden in a path'],
    ['http://lumen.marvinmaiwang.workers.dev.evil.com', 'the domain as a prefix of another'],
    ['javascript:alert(1)//.marvinmaiwang.workers.dev', 'a non-http scheme'],
    ['null', 'the opaque origin a sandboxed frame sends'],
    ['', 'nothing at all'],
  ])('%s — %s', (origin) => {
    expect(originAllowed(origin, ALLOWED)).toBe(false);
  });
});

describe('an exact-only allowlist', () => {
  it('matches the entry and nothing near it', () => {
    const exact = ['https://lumen.marvinmaiwang.workers.dev'];
    expect(originAllowed('https://lumen.marvinmaiwang.workers.dev', exact)).toBe(true);
    expect(originAllowed('https://pr-7-lumen.marvinmaiwang.workers.dev', exact)).toBe(false);
  });

  it('distinguishes a port and a scheme', () => {
    const exact = ['http://localhost:3000'];
    expect(originAllowed('http://localhost:3000', exact)).toBe(true);
    expect(originAllowed('http://localhost:3001', exact)).toBe(false);
    expect(originAllowed('https://localhost:3000', exact)).toBe(false);
  });
});
