import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SECRET_ENV_KEYS } from '@/lib/env.server';

/**
 * "No secret is referenced in any client component" (phase-00 DoD).
 *
 * Two passes, because either alone is escapable:
 *   Source — nothing under app/, components/, or lib/ reads a non-public `process.env` value,
 *            outside an explicit server-only allowlist. This mirrors the ESLint rule so the
 *            guarantee survives someone disabling the rule inline.
 *   Bundle — the built client chunks contain no secret name and no secret value. This needs a
 *            production build, so it is skipped when there is not one — except under
 *            `pnpm test:bundle`, which exists precisely to run it and where a skip would mean the
 *            guarantee quietly stopped being checked.
 */

const ROOT = resolve(import.meta.dirname, '../..');

/** Server-only by construction: never bundled into a client component. */
const SERVER_ONLY = new Set(['lib/env.server.ts']);

function walk(dir: string, exts: string[]): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry.startsWith('.')) return [];
    if (statSync(full).isDirectory()) return walk(full, exts);
    return exts.includes(extname(full)) ? [full] : [];
  });
}

describe('source', () => {
  const sources = ['app', 'components', 'lib'].flatMap((dir) =>
    walk(join(ROOT, dir), ['.ts', '.tsx']),
  );

  it('has app source to check', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it('reads no secret from process.env outside server-only modules', () => {
    const offenders: string[] = [];

    for (const file of sources) {
      const rel = relative(ROOT, file);
      if (SERVER_ONLY.has(rel)) continue;
      const content = readFileSync(file, 'utf8');
      for (const key of SECRET_ENV_KEYS) {
        if (content.includes(`process.env.${key}`) || content.includes(`process.env['${key}']`)) {
          offenders.push(`${rel} reads ${key}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('never prefixes a secret with NEXT_PUBLIC_', () => {
    for (const key of SECRET_ENV_KEYS) {
      expect(key.startsWith('NEXT_PUBLIC_'), key).toBe(false);
    }
  });
});

describe('built client bundle', () => {
  // `.next/BUILD_ID` is written by `next build` and not by `next dev`. Testing for the directory
  // instead let a stale dev build stand in for a production one: the chunks are named and bundled
  // differently, so the checks below ran, found nothing, and reported green against the wrong
  // input. CI caught what a local run had said was fine.
  const built = existsSync(join(ROOT, '.next/BUILD_ID'));
  const chunks = built ? walk(join(ROOT, '.next/static'), ['.js']) : [];

  it('has a production build to inspect when one was asked for', () => {
    // Keyed off the script, not off `CI`. This file is also picked up by the plain `pnpm test:unit`
    // run, which in CI happens *before* `pnpm build` — so "we are in CI" is not the same question
    // as "we meant to check the bundle". `pnpm test:bundle` sets the flag and is the step that
    // runs after the build; there, a skipped leak check is a failure, because it is
    // indistinguishable from a passing one.
    if (process.env.REQUIRE_BUNDLE) {
      expect(built, 'run `pnpm build` before `pnpm test:bundle`').toBe(true);
    }
  });

  it.skipIf(!built)('produced chunks to inspect', () => {
    expect(chunks.length).toBeGreaterThan(0);
  });

  it.skipIf(!built)('contains no secret variable name', () => {
    const offenders: string[] = [];
    for (const chunk of chunks) {
      const content = readFileSync(chunk, 'utf8');
      for (const key of SECRET_ENV_KEYS) {
        // Whole identifier, not substring. `SENTRY_DSN` is a secret and `NEXT_PUBLIC_SENTRY_DSN`
        // is the public one the browser SDK is *supposed* to have — a plain `includes` reports
        // the second as the first, and a leak test that cries wolf gets switched off.
        if (new RegExp(`(?<![A-Za-z0-9_])${key}(?![A-Za-z0-9_])`).test(content)) {
          offenders.push(`${relative(ROOT, chunk)} mentions ${key}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it.skipIf(!built)('contains no secret value from the local environment', () => {
    // Catches the worse failure: a real key inlined because it was mistakenly read in a client
    // component. Only checks values long enough to be a credential rather than a flag.
    const secrets = SECRET_ENV_KEYS.map((key) => process.env[key]).filter(
      (value): value is string => typeof value === 'string' && value.length >= 12,
    );
    if (secrets.length === 0) return;

    const offenders: string[] = [];
    for (const chunk of chunks) {
      const content = readFileSync(chunk, 'utf8');
      for (const secret of secrets) {
        if (content.includes(secret))
          offenders.push(`${relative(ROOT, chunk)} leaks a secret value`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
