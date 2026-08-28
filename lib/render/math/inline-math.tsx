'use client';

import { cn } from '@/lib/utils/cn';

import { useMath } from './use-math';

/**
 * `$…$` inside prose. Sized to the surrounding text rather than to KaTeX's own defaults, so a
 * formula in a sentence does not push the line-height around (03-DESIGN.md §3).
 */
export function InlineMath({
  latex,
  display = false,
  className,
}: {
  latex: string;
  /** `$$…$$` inside prose — a list item's equation, say. Centred, but still part of the flow. */
  display?: boolean;
  className?: string;
}) {
  const rendered = useMath(latex, display);

  if (!rendered || rendered.error) {
    return (
      <code
        className={cn(
          'rounded-note bg-bg-sunken px-1 font-mono text-inline text-text-muted',
          className,
        )}
        // Before KaTeX arrives this is just the source; if it failed to parse, it stays the
        // source, which is still the most useful thing we can show.
        title={rendered?.error ?? undefined}
      >
        {latex}
      </code>
    );
  }

  return (
    <span
      className={cn('lumen-math', display && 'lumen-math-display block py-1', className)}
      // KaTeX's output is generated from LaTeX by a parser that emits no raw HTML from its input,
      // and `trust: false` blocks the commands that could. This is the one place we set markup.
      dangerouslySetInnerHTML={{ __html: rendered.html }}
    />
  );
}
