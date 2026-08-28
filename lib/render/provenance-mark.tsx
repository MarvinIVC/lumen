'use client';

import type { ReactNode } from 'react';

import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils/cn';
import type { Origin } from '@/lib/ai/schema';

import { useReadingMode } from './reading-mode';

/**
 * How the note shows its own seams (03-DESIGN.md §6, 06 §5).
 *
 * The design constraint that shapes all of this: provenance must be *legible without being loud*.
 * A note covered in highlighter is a note nobody rereads, and hiding the marks entirely would
 * make the "we checked our work" promise unverifiable. So the default is a left rule plus a 4–8%
 * tint, the label chip appears on hover or focus, and "Highlight AI" turns everything up at once.
 *
 * Corrections are the exception: they stay visible in every mode, because they are the learning
 * surface. Framed as "here's what to relearn", never as a scold.
 */

const LABELS: Record<Exclude<Origin, 'student'>, string> = {
  'ai-added': 'added',
  'ai-clarified': 'clarified',
  'ai-corrected': 'corrected',
};

const SURFACES: Record<Exclude<Origin, 'student'>, { calm: string; loud: string }> = {
  'ai-added': {
    calm: 'border-l-2 border-ai-added-rule bg-ai-added/50',
    loud: 'border-l-2 border-ai-added-rule bg-ai-added',
  },
  'ai-clarified': {
    calm: 'border-l-2 border-link/40 bg-ai-clarified/60',
    loud: 'border-l-2 border-link bg-ai-clarified',
  },
  'ai-corrected': {
    calm: 'border-l-2 border-ai-corrected-mark/70 bg-ai-corrected/70',
    loud: 'border-l-2 border-ai-corrected-mark bg-ai-corrected',
  },
};

export interface ProvenanceBlockProps {
  origin: Origin;
  children: ReactNode;
  className?: string;
}

/** Wraps a block in its provenance treatment. `student` origin gets no mark at all — it is the baseline. */
export function ProvenanceBlock({ origin, children, className }: ProvenanceBlockProps) {
  const { markIntensity } = useReadingMode();

  if (origin === 'student') {
    return <div className={className}>{children}</div>;
  }

  const surface = SURFACES[origin];
  // A correction never fades all the way out, whatever the reading mode.
  const loud = markIntensity === 'loud' || origin === 'ai-corrected';

  return (
    <div
      data-origin={origin}
      className={cn(
        'group/prov relative rounded-r-note py-1 pr-3 pl-4',
        loud ? surface.loud : surface.calm,
        className,
      )}
    >
      <span
        className={cn(
          'absolute top-1 right-2 text-xs tracking-wide text-text-muted',
          'transition-opacity duration-(--dur-fast) ease-lumen',
          loud
            ? 'opacity-100'
            : 'opacity-0 group-focus-within/prov:opacity-100 group-hover/prov:opacity-100',
        )}
      >
        {LABELS[origin]}
      </span>
      {children}
    </div>
  );
}

/**
 * An `ai-clarified` phrase inside an otherwise student-written sentence: a dotted underline, and
 * the student's own wording one hover away. Rendered as a `<button>` rather than a `<span
 * title>` so it is reachable by keyboard — the original phrasing is evidence, and evidence you
 * can only get to with a mouse is not evidence.
 */
export function ProvenanceSpan({
  origin,
  originalText,
  children,
}: {
  origin: Origin;
  originalText?: string;
  children: ReactNode;
}) {
  const { markIntensity } = useReadingMode();

  if (origin === 'student' || !originalText) return <>{children}</>;

  return (
    <Tooltip
      interactive
      content={
        <span>
          You wrote: <em>“{originalText}”</em>
        </span>
      }
    >
      <button
        type="button"
        className={cn(
          'cursor-help underline decoration-dotted underline-offset-2',
          origin === 'ai-corrected' ? 'decoration-ai-corrected-mark' : 'decoration-link',
          markIntensity === 'loud' && 'bg-ai-clarified',
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}
