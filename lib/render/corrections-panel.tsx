'use client';

import { useEffect, useState } from 'react';

import { CheckIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils/cn';
import { useReducedMotion } from '@/lib/design/motion';
import type { Correction } from '@/lib/ai/schema';

import { renderInline } from './markdown/inline';

/**
 * "What to relearn" (06 §5.6). Corrections are framed as a feature, never as a scold — the heading
 * says what to do next, and each entry gives the student's line, the fix, and *why it matters*,
 * because a correction without a reason is just an assertion to memorise.
 *
 * The count animates up on arrival. It is a small thing, but 06 §5.6 is right that it is the
 * moment the product earns trust: a number that counts up reads as work done on your behalf.
 */
export function CorrectionsPanel({
  corrections,
  anchorFor,
  className,
}: {
  corrections: Correction[];
  /**
   * Where this correction happened, as an element id.
   *
   * The panel is at the bottom of a long document and a correction without a way back to the
   * sentence it is about is a quiz question — "you wrote X" is only useful next to where you wrote
   * it. Resolved by the caller because only it knows which block carried the change; phase-05 gave
   * blocks ids so there is finally something to point at.
   */
  anchorFor?: (correction: Correction) => string | null;
  className?: string;
}) {
  if (corrections.length === 0) return null;

  return (
    <section aria-labelledby="corrections-heading" className={cn('mt-12 font-sans', className)}>
      <div className="mb-4 flex items-baseline gap-3 border-t border-border pt-6">
        <h2 id="corrections-heading" className="font-serif text-xl font-semibold text-text">
          What to relearn
        </h2>
        <CountUp value={corrections.length} />
      </div>

      <ol className="flex flex-col gap-5">
        {corrections.map((correction, index) => (
          <li
            key={index}
            className="rounded-note border-l-2 border-ai-corrected-mark bg-ai-corrected/70 py-3 pr-4 pl-4"
          >
            <p className="text-sm leading-snug">
              <span className="sr-only">You wrote: </span>
              <span className="text-text-muted line-through decoration-ai-corrected-mark">
                {renderInline(correction.original, `corr-orig-${index}`)}
              </span>
            </p>
            <p className="mt-1.5 flex gap-2 text-sm leading-snug text-text">
              <CheckIcon aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
              <span>
                <span className="sr-only">Corrected to: </span>
                {renderInline(correction.corrected, `corr-fix-${index}`)}
              </span>
            </p>
            {correction.why ? (
              <p className="mt-2 text-sm leading-snug text-text-muted">
                <span className="font-medium text-text">Why it matters. </span>
                {renderInline(correction.why, `corr-why-${index}`)}
              </p>
            ) : null}
            <CorrectionLink anchor={anchorFor?.(correction) ?? null} />
          </li>
        ))}
      </ol>
    </section>
  );
}

/** "Show me where" — a plain anchor, so it works before hydration and with JavaScript off. */
function CorrectionLink({ anchor }: { anchor: string | null }) {
  if (!anchor) return null;
  return (
    <a
      href={`#${anchor}`}
      className="mt-2 inline-block text-sm font-medium text-link underline-offset-2 hover:underline"
    >
      Show me where
    </a>
  );
}

/** Counts from zero to the total once, then stops. Instant when motion is reduced (§7). */
function CountUp({ value }: { value: number }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    setShown(0);
    let current = 0;
    const timer = window.setInterval(() => {
      current += 1;
      setShown(current);
      if (current >= value) window.clearInterval(timer);
    }, 90);
    return () => window.clearInterval(timer);
  }, [value, reduced]);

  return (
    <p className="text-sm text-text-muted">
      {/* The live number would otherwise be announced once per tick. */}
      <span aria-hidden="true">{shown}</span>
      <span className="sr-only">{value}</span> {value === 1 ? 'correction' : 'corrections'}
    </p>
  );
}
