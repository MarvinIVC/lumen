/**
 * Typography (03-DESIGN.md §3). Self-hosted at build time by next/font, so there is no
 * render-blocking request to fonts.googleapis.com and no layout shift: next/font emits a
 * size-adjusted local fallback that matches each face's metrics.
 *
 * The CSS variables here are consumed by `tokens.css` (--font-sans / --font-serif / --font-mono).
 */
import { Inter, JetBrains_Mono, Newsreader } from 'next/font/google';

/** Note body and headings. Optical sizing on, because notes mix 18px body with 2.5rem display. */
export const newsreader = Newsreader({
  subsets: ['latin'],
  axes: ['opsz'],
  display: 'swap',
  variable: '--font-newsreader',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
});

/** All app chrome: nav, buttons, panels, forms, library. */
export const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  fallback: ['system-ui', 'sans-serif'],
});

/** Rare: SMILES strings, raw LaTeX in edit mode. */
export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
});

export const fontVariables = [newsreader.variable, inter.variable, jetbrainsMono.variable].join(
  ' ',
);
