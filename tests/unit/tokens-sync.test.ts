import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { dark, light, scale } from '@/lib/design/tokens';

/**
 * The tokens pipeline (03-DESIGN.md §10) only works if tokens.css and tokens.ts describe exactly
 * the same set of tokens with exactly the same values. Deleting, renaming, or re-valuing a token
 * in one file and not the other fails here — which is the point.
 */

const CSS = readFileSync(resolve(import.meta.dirname, '../../lib/design/tokens.css'), 'utf8');

/** Pulls the declarations between `@tokens <name>:start` and `@tokens <name>:end`. */
function parseBlock(name: string): Record<string, string> {
  const pattern = new RegExp(
    `/\\* @tokens ${name}:start \\*/([\\s\\S]*?)/\\* @tokens ${name}:end \\*/`,
  );
  const match = CSS.match(pattern);
  if (!match) throw new Error(`tokens.css is missing the "${name}" block markers`);

  const entries: Record<string, string> = {};
  const declaration = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let found: RegExpExecArray | null;
  while ((found = declaration.exec(match[1]!)) !== null) {
    entries[found[1]!] = found[2]!.trim().replace(/\s+/g, ' ');
  }
  return entries;
}

const cssScale = parseBlock('scale');
const cssLight = parseBlock('light');
const cssDark = parseBlock('dark');
const cssDarkMedia = parseBlock('dark-media');

describe.each([
  ['scale', cssScale, scale as Record<string, string>],
  ['light', cssLight, light as Record<string, string>],
  ['dark', cssDark, dark as Record<string, string>],
])('%s tokens', (name, css, ts) => {
  it('defines the same token names in tokens.css and tokens.ts', () => {
    expect(Object.keys(ts).sort()).toEqual(Object.keys(css).sort());
  });

  it('defines the same values in tokens.css and tokens.ts', () => {
    for (const [token, cssValue] of Object.entries(css)) {
      expect(ts[token], `${name} ${token}`).toBe(cssValue);
    }
  });
});

describe('theme completeness', () => {
  it('gives every color token a dark counterpart', () => {
    expect(Object.keys(cssDark).sort()).toEqual(Object.keys(cssLight).sort());
  });

  it('keeps the two dark blocks identical', () => {
    // One block serves `prefers-color-scheme`, the other the explicit override. They must not
    // drift, or the OS theme and the toggle would render differently.
    expect(cssDarkMedia).toEqual(cssDark);
  });

  it('defines no color only inside the media query (03-DESIGN.md §2)', () => {
    const mediaOnly = Object.keys(cssDarkMedia).filter((token) => !(token in cssLight));
    expect(mediaOnly).toEqual([]);
  });

  it('actually changes color between themes', () => {
    // Guards against a copy-paste that leaves dark identical to light.
    expect(cssDark['--bg']).not.toBe(cssLight['--bg']);
    expect(cssDark['--text']).not.toBe(cssLight['--text']);
    expect(cssDark['--accent']).not.toBe(cssLight['--accent']);
  });

  it('holds the palette specified in 03-DESIGN.md §2', () => {
    expect(cssLight['--bg']).toBe('#fcfbf8');
    expect(cssLight['--accent']).toBe('#2f5d50');
    expect(cssDark['--bg']).toBe('#171613');
    expect(cssDark['--accent']).toBe('#6fbfa6');
  });
});

describe('scale', () => {
  it('carries the full nine-step type scale (03-DESIGN.md §3)', () => {
    const sizes = ['xs', 'sm', 'base', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'];
    for (const size of sizes) expect(cssScale[`--fs-${size}`]).toBeDefined();
    expect(cssScale['--fs-base']).toBe('1rem');
    expect(cssScale['--fs-4xl']).toBe('3.5rem');
  });

  it('carries the nine-step spacing scale (03-DESIGN.md §4)', () => {
    const expected = ['4px', '8px', '12px', '16px', '24px', '32px', '48px', '64px', '96px'];
    expect(expected.map((_, i) => cssScale[`--space-${i + 1}`])).toEqual(expected);
  });

  it('carries the radius and motion tokens', () => {
    expect(cssScale['--r-sm']).toBe('6px');
    expect(cssScale['--r-md']).toBe('10px');
    expect(cssScale['--r-lg']).toBe('16px');
    expect(cssScale['--ease']).toBe('cubic-bezier(0.2, 0.8, 0.2, 1)');
  });
});
