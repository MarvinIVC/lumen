/**
 * Typography (03-DESIGN.md §3). Self-hosted at build time by next/font, so there is no
 * render-blocking request to fonts.googleapis.com and no layout shift: next/font emits a
 * size-adjusted local fallback that matches each face's metrics.
 *
 * The CSS variables here are consumed by `tokens.css` (--font-sans / --font-serif / --font-mono).
 *
 * **Two changes here are performance decisions with a measurement behind them** (phase-02, against
 * `lighthouserc.mobile.cjs`). The marketing headline is the Largest Contentful Paint element on
 * every public route and it is set in the serif, so the serif decides the number.
 *
 * 1. **Only Newsreader is preloaded.** next/font preloads every family by default, which put the
 *    serif, the sans and the mono on the critical path of one throttled connection. Inter and
 *    JetBrains Mono are still self-hosted and still `swap`; they are discovered through the
 *    stylesheet a moment later, and they set copy small enough that their swap can never be the
 *    largest paint.
 *
 * 2. **Newsreader no longer requests the `opsz` axis.** Phase-01 added it deliberately — optical
 *    sizing is a real part of why the note reads bookishly at 18px and holds together at 40px — but
 *    it is a two-axis variable font, and the axis was costing 71 KB of the 129 KB. Dropping it took
 *    the file to 58 KB, the emulated-4G LCP from 2.6 s to 1.4 s and the mobile performance score
 *    from 94 to 100. Optical sizing is worth having; it is not worth a second of headline on a
 *    student's phone. `font-optical-sizing: auto` in `notes.css` is now inert and says so.
 */
import { Inter, JetBrains_Mono, Newsreader } from 'next/font/google';

/** Note body and headings. Optical sizing on, because notes mix 18px body with 2.5rem display. */
export const newsreader = Newsreader({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-newsreader',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
});

/** All app chrome: nav, buttons, panels, forms, library. */
export const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  // Not preloaded — see the note at the top of this file. Inter sets the sub-headline and the
  // buttons, never the largest element on the page.
  preload: false,
  variable: '--font-inter',
  fallback: ['system-ui', 'sans-serif'],
});

/** Rare: SMILES strings, raw LaTeX in edit mode. */
export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  // Kickers, units and SMILES strings. Preloading a face this incidental only ever took bandwidth
  // away from the one the headline is set in.
  preload: false,
  variable: '--font-jetbrains-mono',
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
});

export const fontVariables = [newsreader.variable, inter.variable, jetbrainsMono.variable].join(
  ' ',
);
