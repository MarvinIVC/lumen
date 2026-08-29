import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * 03-DESIGN.md §10: tokens are the only source of color, space and type.
 *
 * ESLint enforces this inside `.ts`/`.tsx`, but it does not parse CSS — and CSS is exactly where a
 * hardcoded colour is easiest to slip in and hardest to spot, because it looks like every other
 * line around it. This walks the design-system trees and reads them as text.
 */

const ROOT = resolve(import.meta.dirname, '../..');

/** The files that are *allowed* to spell values out, and why. */
const ALLOWED = new Set([
  // The palette itself.
  'lib/design/tokens.css',
  'lib/design/tokens.ts',
  // Print overrides the palette with literal light values on purpose: a PDF has no CSS variables
  // once it is a PDF, and the ink has to be right on paper rather than on a backlit screen.
  'lib/render/print.css',
]);

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const ARBITRARY_LENGTH = /\[-?[0-9.]+(px|rem|em|pt)\]/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx|css)$/.test(entry) ? [full] : [];
  });
}

const files = ['components', 'lib/render', 'lib/design']
  .flatMap((dir) => walk(resolve(ROOT, dir)))
  .map((file) => relative(ROOT, file))
  .filter((file) => !ALLOWED.has(file) && !file.endsWith('.stories.tsx'));

describe('the design system uses tokens and nothing else', () => {
  it('has files to check', () => {
    // A refactor that moves the components elsewhere should fail here rather than pass vacuously.
    expect(files.length).toBeGreaterThan(40);
  });

  it.each(files)('%s has no hardcoded colour', (file) => {
    const offenders = readFileSync(resolve(ROOT, file), 'utf8')
      .split('\n')
      .map((line, index) => ({ line: line.trim(), number: index + 1 }))
      .filter((entry) => HEX.test(entry.line));

    expect(
      offenders.map((entry) => `${file}:${entry.number} ${entry.line}`),
      'Use a token — a Tailwind utility such as `bg-accent-weak`, or `var(--accent)`.',
    ).toEqual([]);
  });

  it.each(files)('%s has no arbitrary length', (file) => {
    const offenders = readFileSync(resolve(ROOT, file), 'utf8')
      .split('\n')
      .map((line, index) => ({ line: line.trim(), number: index + 1 }))
      .filter((entry) => ARBITRARY_LENGTH.test(entry.line));

    expect(
      offenders.map((entry) => `${file}:${entry.number} ${entry.line}`),
      'Use the spacing/type scale, or reference a token: `w-(--margin-col)`.',
    ).toEqual([]);
  });
});
