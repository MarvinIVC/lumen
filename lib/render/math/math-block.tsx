'use client';

import { useRef } from 'react';

import { cn } from '@/lib/utils/cn';

import { useMath } from './use-math';
import { useScrollableRegion } from '../use-overflow';

export interface MathBlockProps {
  latex: string;
  /** Right-aligned equation number, e.g. "1.2". Omit for an unnumbered display equation. */
  number?: string;
  className?: string;
}

/**
 * A display equation: centered, with the number set flush right on the same optical line
 * (03-DESIGN.md §6). The number sits in its own grid column so a long equation cannot collide
 * with it, and it is `aria-hidden` — a screen reader reading "n equals m over M, one point two"
 * would be reading a cross-reference as if it were part of the maths.
 */
export function MathBlock({ latex, number, className }: MathBlockProps) {
  const rendered = useMath(latex, true);
  const scroller = useRef<HTMLDivElement>(null);
  // Only an equation too wide for its column becomes a tab stop — see `useScrollableRegion`.
  useScrollableRegion(scroller, number ? `Equation ${number}` : 'Equation');

  return (
    <div className={cn('grid grid-cols-[1fr_auto] items-center gap-4 py-1', className)}>
      {/*
        `py-2` is load-bearing. CSS forces `overflow-y` to compute to `auto` whenever `overflow-x`
        is not `visible`, and KaTeX's display math overhangs its line box by a few pixels — so
        without vertical headroom every equation on the page is a scrollable region that a
        keyboard user cannot reach and an accessibility checker rightly objects to.
      */}
      <div ref={scroller} className="min-w-0 overflow-x-auto py-2 text-center">
        {!rendered || rendered.error ? (
          <code className="inline-block rounded-note bg-bg-sunken px-2 py-1 font-mono text-sm text-text-muted">
            {latex}
          </code>
        ) : (
          <span
            className="lumen-math lumen-math-display"
            dangerouslySetInnerHTML={{ __html: rendered.html }}
          />
        )}
      </div>
      {number ? (
        <span aria-hidden="true" className="font-mono text-sm text-text-muted tabular-nums">
          ({number})
        </span>
      ) : (
        <span />
      )}
    </div>
  );
}
