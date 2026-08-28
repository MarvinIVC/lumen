'use client';

import { useEffect, useState } from 'react';

import { renderMath } from './katex';
import type { RenderedMath } from './katex';

/**
 * Renders LaTeX for a component. Returns `null` until KaTeX has loaded — callers render the raw
 * source in a mono chip meanwhile, so the content is readable at every moment including when the
 * chunk never arrives.
 */
export function useMath(latex: string, displayMode = false): RenderedMath | null {
  const [result, setResult] = useState<RenderedMath | null>(null);

  useEffect(() => {
    let active = true;
    void renderMath(latex, { displayMode }).then((rendered) => {
      if (active) setResult(rendered);
    });
    return () => {
      active = false;
    };
  }, [latex, displayMode]);

  return result;
}
