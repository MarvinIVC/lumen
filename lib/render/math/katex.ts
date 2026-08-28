'use client';

// Type-only: erased at compile time, so this does not pull katex into any bundle.
import type * as KatexNamespace from 'katex';

/**
 * KaTeX, loaded once and only when a note actually contains math (06 §1, 02-ARCHITECTURE.md §8).
 *
 * Everything here is behind `import()`: katex itself, the mhchem extension that gives us
 * `\ce{^{35}_{17}Cl}`, and the stylesheet. A note with no equations never pays for any of it, and
 * `tests/unit/dynamic-imports.test.ts` fails the build if a static import creeps back in.
 */

type KatexModule = typeof KatexNamespace;

let loader: Promise<KatexModule> | null = null;

export function loadKatex(): Promise<KatexModule> {
  loader ??= (async () => {
    const [katex] = await Promise.all([
      import('katex').then((module) => module.default ?? module),
      // mhchem registers itself onto katex as a side effect, so it must land before first render.
      import('katex/contrib/mhchem'),
      import('katex/dist/katex.min.css'),
    ]);
    return katex as KatexModule;
  })();
  return loader;
}

export interface RenderMathOptions {
  displayMode?: boolean;
}

export interface RenderedMath {
  html: string;
  /** Set when KaTeX could not parse the input; the caller shows the raw LaTeX instead. */
  error: string | null;
}

/**
 * Renders to an HTML string containing both the visual output and MathML, which is what makes a
 * screen reader read "n equals m over M" rather than spelling out the markup (01-PRODUCT.md §7).
 *
 * Never throws. 06 §1 is explicit that a parse failure shows the raw LaTeX in a muted chip rather
 * than a red KaTeX error box — a student should see the formula they wrote, not our stack trace.
 */
export async function renderMath(
  latex: string,
  options: RenderMathOptions = {},
): Promise<RenderedMath> {
  const katex = await loadKatex();
  try {
    const html = katex.renderToString(latex, {
      displayMode: options.displayMode ?? false,
      output: 'htmlAndMathml',
      throwOnError: true,
      strict: 'warn',
      // `\color` and friends would let generated content escape the palette (03-DESIGN.md §9).
      trust: false,
      macros: {},
    });
    return { html, error: null };
  } catch (error) {
    return { html: '', error: error instanceof Error ? error.message : 'Could not render' };
  }
}
