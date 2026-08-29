import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The heavy renderers stay out of every static bundle (02-ARCHITECTURE.md §8, 06 §1).
 *
 * KaTeX, Mermaid, smiles-drawer and paged.js are together several hundred kilobytes, and a note
 * with no maths, no diagram and no structure should pay for none of it. One static `import` is
 * all it takes to undo that, and the damage is invisible until someone reads the build stats — so
 * it is asserted here instead.
 */

const ROOT = resolve(import.meta.dirname, '../..');

const DEFERRED = ['katex', 'mermaid', 'smiles-drawer', 'pagedjs'];

/** `import type` is erased at compile time and ships nothing. */
const STATIC_IMPORT = (pkg: string) =>
  new RegExp(String.raw`^\s*import\s+(?!type\b)[^;]*?from\s+['"]${pkg}(/[^'"]*)?['"]`, 'm');

const DYNAMIC_IMPORT = (pkg: string) =>
  new RegExp(String.raw`import\(\s*['"]${pkg}(/[^'"]*)?['"]\s*\)`);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

const sources = ['app', 'components', 'lib']
  .flatMap((dir) => walk(resolve(ROOT, dir)))
  .map((file) => relative(ROOT, file));

describe.each(DEFERRED)('%s', (pkg) => {
  it('is never imported statically', () => {
    const offenders = sources.filter((file) =>
      STATIC_IMPORT(pkg).test(readFileSync(resolve(ROOT, file), 'utf8')),
    );
    expect(
      offenders,
      `Import ${pkg} with await import('${pkg}') so it lands in its own async chunk.`,
    ).toEqual([]);
  });

  it('is reachable through exactly one dynamic import', () => {
    // One loader per library, memoised, so two diagrams on a page do not fetch the chunk twice
    // and so there is one place to change how it is themed.
    const loaders = sources.filter((file) =>
      DYNAMIC_IMPORT(pkg).test(readFileSync(resolve(ROOT, file), 'utf8')),
    );
    expect(loaders, `${pkg} should have exactly one loader module`).toHaveLength(1);
  });
});
