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
 *   Bundle — the built client chunks contain no secret name and no secret value. This runs after
 *            `pnpm build` (CI calls it via `pnpm test:bundle`) and is skipped when there is no
 *            build to inspect.
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
  const staticDir = join(ROOT, '.next/static');
  const built = existsSync(staticDir);
  const chunks = built ? walk(staticDir, ['.js']) : [];

  it.skipIf(!built)('produced chunks to inspect', () => {
    expect(chunks.length).toBeGreaterThan(0);
  });

  it.skipIf(!built)('contains no secret variable name', () => {
    const offenders: string[] = [];
    for (const chunk of chunks) {
      const content = readFileSync(chunk, 'utf8');
      for (const key of SECRET_ENV_KEYS) {
        if (content.includes(key)) offenders.push(`${relative(ROOT, chunk)} mentions ${key}`);
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
