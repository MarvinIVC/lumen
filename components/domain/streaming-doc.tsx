'use client';

import { useEffect, useRef, useState } from 'react';

import { Progress } from '@/components/ui/progress';
import { CheckIcon } from '@/components/ui/icons';
import { Skeleton, SkeletonParagraph } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils/cn';
import { useReducedMotion } from '@/lib/design/motion';
import { NoteDocument } from '@/lib/render/NoteDocument';
import type { NoteDocument as NoteDocumentType } from '@/lib/ai/schema';

export interface StreamingDocProps {
  /** A partial document — sections arrive one at a time (04-AI-ENGINE.md §8). */
  doc: NoteDocumentType;
  /** How many sections the model said it would produce, for the skeletons still to come. */
  expectedSections?: number;
  /** The narration line: "Checking the mercury calculation…". Cross-fades when it changes. */
  status?: string;
  done?: boolean;
  className?: string;
}

/**
 * The note arriving (03-DESIGN.md §7). Three moving parts, and the restraint in each is the point:
 *
 *   a hairline under the top bar, not a spinner over the page — the note is readable as it lands;
 *   a narration line that cross-fades, so it reads as one voice rather than a log;
 *   one "settle" at the end — a soft check pulses once beside the title. No confetti.
 *
 * Under `prefers-reduced-motion` all three become instant state changes and the reveal is skipped
 * entirely, which is what §7 means by "no motion" rather than "less motion".
 */
export function StreamingDoc({
  doc,
  expectedSections,
  status,
  done = false,
  className,
}: StreamingDocProps) {
  const reduced = useReducedMotion();
  const pending = Math.max(0, (expectedSections ?? doc.sections.length) - doc.sections.length);

  return (
    <div className={cn('relative', className)}>
      {/* Progress and narration are one live region, so a screen reader hears the story once. */}
      <div
        className="sticky top-0 z-10 -mx-5 border-b border-border bg-bg/85 px-5 py-3 backdrop-blur-sm"
        aria-live="polite"
        aria-busy={!done}
      >
        <div className="mx-auto flex max-w-(--note-shell) items-center gap-3 font-sans">
          {done ? (
            <SettleMark reduced={reduced} />
          ) : (
            <span className="size-4 shrink-0" aria-hidden="true" />
          )}
          <StatusLine status={status} done={done} reduced={reduced} />
        </div>
        {done ? null : (
          <Progress
            variant="hairline"
            label="Rebuilding your notes"
            className="absolute inset-x-0 bottom-0"
          />
        )}
      </div>

      <NoteDocument doc={doc} partial={!done} />

      {pending > 0 ? (
        <div
          role="group"
          className="mx-auto max-w-(--note-shell) px-5 pb-16"
          aria-label={`${pending} more ${pending === 1 ? 'section' : 'sections'} on the way`}
        >
          {Array.from({ length: pending }, (_, index) => (
            <div key={index} className="mt-12 max-w-(--measure) border-t border-border pt-6">
              <Skeleton className="h-7 w-1/2" />
              <SkeletonParagraph lines={4} className="mt-4" />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Cross-fades between messages. Keyed on the text so React remounts it, which is what makes the
 * animation run again for each new line without any imperative bookkeeping.
 */
function StatusLine({
  status,
  done,
  reduced,
}: {
  status?: string;
  done: boolean;
  reduced: boolean;
}) {
  const text = done ? 'Done. Your notes are rebuilt.' : (status ?? 'Reading your notes…');

  return (
    <p key={text} className={cn('text-sm text-text-muted', !reduced && 'animate-fade-in')}>
      {text}
    </p>
  );
}

/** The completion moment: one soft pulse, then it just sits there. */
function SettleMark({ reduced }: { reduced: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-4 shrink-0 place-items-center rounded-full bg-accent text-accent-fg',
        !reduced && 'animate-settle',
      )}
    >
      <CheckIcon className="size-2.5" />
    </span>
  );
}

/**
 * Reveals its children with a fade-up as they arrive (§7). A section uses one of these; blocks
 * inside it do not, because staggering every paragraph turns reading into waiting.
 */
export function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  const [seen, setSeen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setSeen(true), []);

  return (
    <div ref={ref} className={cn(!reduced && !seen && 'animate-reveal', className)}>
      {children}
    </div>
  );
}
