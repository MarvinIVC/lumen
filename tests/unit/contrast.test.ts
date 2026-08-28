import { describe, expect, it } from 'vitest';

import { dark, light } from '@/lib/design/tokens';

/**
 * Contrast is a gate, not an aspiration: 02-ARCHITECTURE.md §8 puts the Lighthouse accessibility
 * budget at 95, and a palette that fails AA cannot get there once real screens exist.
 *
 * Each token is held to the ratio its *role* demands, which is not the same for all of them:
 *   4.5:1  body copy and any text below 24px
 *   3.0:1  large text (>= 24px, or >= 18.66px bold) and non-text UI such as borders and icons
 *
 * `--text-faint` and `--warning` sit deliberately in the second bucket — a hairline-label token
 * and a marker/rule token respectively. Using either for prose is the mistake this file exists
 * to catch.
 */

const AA_TEXT = 4.5;
const AA_LARGE = 3;

function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const THEMES = [
  ['light', light],
  ['dark', dark],
] as const;

describe.each(THEMES)('%s theme', (_name, theme) => {
  const on = (token: keyof typeof light, surface: keyof typeof light = '--bg') =>
    contrast(theme[token], theme[surface]);

  it.each([
    ['--text', AA_TEXT],
    ['--text-muted', AA_TEXT],
    ['--accent', AA_TEXT],
    ['--link', AA_TEXT],
    ['--success', AA_TEXT],
    ['--danger', AA_TEXT],
  ] as const)('%s reads as body copy on --bg', (token, minimum) => {
    expect(on(token)).toBeGreaterThanOrEqual(minimum);
  });

  it.each(['--text-faint', '--warning'] as const)(
    '%s is a marker token and clears the large-text/non-text bar',
    (token) => {
      expect(on(token)).toBeGreaterThanOrEqual(AA_LARGE);
    },
  );

  it('keeps body text legible on every surface, not just the page background', () => {
    for (const surface of ['--bg', '--bg-raised', '--bg-sunken'] as const) {
      expect(on('--text', surface), surface).toBeGreaterThanOrEqual(AA_TEXT);
      expect(on('--text-muted', surface), surface).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('keeps borders visible as non-text UI', () => {
    expect(contrast(theme['--border-strong'], theme['--bg'])).toBeGreaterThanOrEqual(1.4);
  });

  it('keeps provenance tints as tints — legible, never a fill (03-DESIGN.md §2)', () => {
    for (const tint of ['--ai-clarified-bg', '--ai-corrected-bg', '--verify-bg'] as const) {
      // Text must still read on top of the tint...
      expect(contrast(theme['--text'], theme[tint]), tint).toBeGreaterThanOrEqual(AA_TEXT);
      // ...and the tint must stay close to the page, not shout.
      expect(contrast(theme[tint], theme['--bg']), tint).toBeLessThan(1.6);
    }
  });

  it('records exactly which tokens fall short of the body-copy bar', () => {
    // A ledger, not a wish: if a palette change moves a token across 4.5:1 in either direction
    // this fails, and the note in tokens.css has to be updated with it.
    const belowBodyBar = (['--text-faint', '--warning', '--success', '--danger'] as const).filter(
      (token) => on(token) < AA_TEXT,
    );
    expect(belowBodyBar).toEqual(
      _name === 'light' ? ['--text-faint', '--warning'] : ['--text-faint'],
    );
  });

  it('keeps the correction marker legible on its own tint', () => {
    expect(contrast(theme['--ai-corrected-mk'], theme['--ai-corrected-bg'])).toBeGreaterThanOrEqual(
      AA_LARGE,
    );
  });
});
