/**
 * Lumen design tokens, mirrored from ./tokens.css for JS consumers.
 *
 * Mermaid, smiles-drawer and the hand-rolled SVG charts (03-DESIGN.md §9) need token values as
 * strings, not CSS variables, so they are duplicated here. `tests/unit/tokens-sync.test.ts`
 * parses tokens.css and fails if either file gains, loses, or changes a token the other has.
 *
 * At runtime prefer `readToken()` over these literals: it reads the *resolved* value from the
 * document, which is what you want when the user has toggled the theme.
 */

/** Theme-independent: type, space, radius, motion, layout. */
export const scale = {
  '--font-sans': "var(--font-inter), system-ui, -apple-system, 'Segoe UI', sans-serif",
  '--font-serif': "var(--font-newsreader), Georgia, 'Times New Roman', serif",
  '--font-mono': 'var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, Menlo, monospace',

  '--fs-xs': '0.75rem',
  '--fs-sm': '0.875rem',
  '--fs-base': '1rem',
  '--fs-md': '1.125rem',
  '--fs-lg': '1.25rem',
  '--fs-xl': '1.5rem',
  '--fs-2xl': '1.875rem',
  '--fs-3xl': '2.5rem',
  '--fs-4xl': '3.5rem',
  '--fs-inline': '0.9em',

  '--lh-tight': '1.2',
  '--lh-snug': '1.35',
  '--lh-normal': '1.5',
  '--lh-note': '1.65',

  '--space-1': '4px',
  '--space-2': '8px',
  '--space-3': '12px',
  '--space-4': '16px',
  '--space-5': '24px',
  '--space-6': '32px',
  '--space-7': '48px',
  '--space-8': '64px',
  '--space-9': '96px',

  '--r-sm': '6px',
  '--r-md': '10px',
  '--r-lg': '16px',
  '--r-note': '4px',
  '--r-full': '9999px',

  '--dur-fast': '120ms',
  '--dur-base': '200ms',
  '--dur-slow': '320ms',
  '--ease': 'cubic-bezier(0.2, 0.8, 0.2, 1)',

  '--measure': '68ch',
  '--margin-col': '15rem',
  '--note-shell': 'calc(var(--measure) + 37rem)',
  '--focus-ring': '2px',
  '--focus-offset': '2px',
} as const;

/** Light (default) — warm paper, ink text. */
export const light = {
  '--color-scheme': 'light',

  '--bg': '#fcfbf8',
  '--bg-raised': '#ffffff',
  '--bg-sunken': '#f5f3ee',
  '--border': '#e7e3d9',
  '--border-strong': '#d8d2c4',
  '--text': '#22201b',
  '--text-muted': '#6b6559',
  '--text-faint': '#97907f',
  '--accent': '#2f5d50',
  '--accent-hover': '#264a40',
  '--accent-weak': '#e7efeb',
  '--accent-fg': '#fcfbf8',
  '--link': '#1f5fa8',

  '--origin-student': 'transparent',
  '--ai-added-bg': 'var(--accent-weak)',
  '--ai-added-rule': 'var(--accent)',
  '--ai-clarified-bg': '#eef4fb',
  '--ai-corrected-bg': '#fbf1e4',
  '--ai-corrected-mk': '#b4741f',
  '--verify-bg': '#fbf1e4',
  '--success': '#2f7d4f',
  '--warning': '#b4741f',
  '--danger': '#a6402f',
  '--danger-hover': '#8c3527',
  '--danger-fg': '#fcfbf8',

  '--shadow-1': '0 1px 2px rgb(0 0 0 / 0.04), 0 4px 12px rgb(0 0 0 / 0.06)',
  '--shadow-2': '0 2px 4px rgb(0 0 0 / 0.06), 0 12px 32px rgb(0 0 0 / 0.1)',
} as const;

/** Dark — warm near-black, never blue-gray. */
export const dark = {
  '--color-scheme': 'dark',

  '--bg': '#171613',
  '--bg-raised': '#1f1e1a',
  '--bg-sunken': '#121110',
  '--border': '#33302a',
  '--border-strong': '#45413a',
  '--text': '#ece8de',
  '--text-muted': '#a8a192',
  '--text-faint': '#746d5e',
  '--accent': '#6fbfa6',
  '--accent-hover': '#8ad0b9',
  '--accent-weak': '#22302b',
  '--accent-fg': '#171613',
  '--link': '#7fb2e6',

  '--origin-student': 'transparent',
  '--ai-added-bg': 'var(--accent-weak)',
  '--ai-added-rule': 'var(--accent)',
  '--ai-clarified-bg': '#1b2836',
  '--ai-corrected-bg': '#322a1c',
  '--ai-corrected-mk': '#e0a860',
  '--verify-bg': '#322a1c',
  '--success': '#6fbf8f',
  '--warning': '#e0a860',
  '--danger': '#e08a78',
  '--danger-hover': '#eaa294',
  '--danger-fg': '#171613',

  '--shadow-1': '0 1px 2px rgb(0 0 0 / 0.3), 0 4px 12px rgb(0 0 0 / 0.24)',
  '--shadow-2': '0 2px 4px rgb(0 0 0 / 0.36), 0 12px 32px rgb(0 0 0 / 0.32)',
} as const;

export const tokens = { scale, light, dark } as const;

export type ScaleToken = keyof typeof scale;
export type ColorToken = keyof typeof light;
export type TokenName = ScaleToken | ColorToken;

/**
 * Resolved value of a token for the document's *current* theme. Returns '' during SSR.
 * This is what the third-party renderers should be fed (03-DESIGN.md §9), because they need
 * concrete colors and must be re-initialised when the theme changes.
 */
export function readToken(name: TokenName, el?: Element): string {
  if (typeof window === 'undefined') return '';
  const target = el ?? document.documentElement;
  return getComputedStyle(target).getPropertyValue(name).trim();
}

/** Resolved values for a set of tokens — convenience for building a Mermaid theme object. */
export function readTokens<T extends TokenName>(
  names: readonly T[],
  el?: Element,
): Record<T, string> {
  return Object.fromEntries(names.map((n) => [n, readToken(n, el)])) as Record<T, string>;
}
