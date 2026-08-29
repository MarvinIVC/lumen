'use client';

import { useState } from 'react';

import { cn } from '@/lib/utils/cn';
import { useReducedMotion } from '@/lib/design/motion';
import { renderInline } from '@/lib/render/markdown/inline';
import type { Flashcard as FlashcardType } from '@/lib/ai/schema';

export interface FlashcardProps {
  card: FlashcardType;
  className?: string;
}

/**
 * One card, flipping in 3D (03-DESIGN.md §7).
 *
 * The flip is a `<button>` with `aria-pressed`, not a div with a click handler, and both faces
 * are always in the DOM with the hidden one `aria-hidden` — a screen reader user gets the same
 * "look, then check" rhythm as everyone else rather than both sides read out at once.
 *
 * With reduced motion the faces swap instantly: no rotation, no transition.
 */
export function Flashcard({ card, className }: FlashcardProps) {
  const [flipped, setFlipped] = useState(false);
  const reduced = useReducedMotion();

  return (
    <button
      type="button"
      aria-pressed={flipped}
      aria-label={flipped ? 'Showing the answer. Flip back.' : 'Showing the question. Flip over.'}
      onClick={() => setFlipped((value) => !value)}
      className={cn('block w-full [perspective:1200px]', className)}
    >
      <div
        className={cn(
          'relative min-h-44 w-full [transform-style:preserve-3d]',
          !reduced && 'transition-transform duration-(--dur-flip) ease-lumen',
          flipped && !reduced && '[transform:rotateY(180deg)]',
        )}
      >
        <Face hidden={reduced ? flipped : false} label="Question" tone="raised">
          {renderInline(card.front, 'front')}
        </Face>
        <Face
          back
          reduced={reduced}
          hidden={reduced ? !flipped : false}
          label="Answer"
          tone="accent"
        >
          {renderInline(card.back, 'back')}
        </Face>
      </div>
    </button>
  );
}

function Face({
  children,
  label,
  tone,
  back = false,
  reduced = false,
  hidden = false,
}: {
  children: React.ReactNode;
  label: string;
  tone: 'raised' | 'accent';
  back?: boolean;
  reduced?: boolean;
  hidden?: boolean;
}) {
  return (
    <div
      aria-hidden={hidden}
      className={cn(
        'flex min-h-44 flex-col items-center justify-center gap-2 rounded-md border p-5 text-center',
        'backface-hidden',
        tone === 'accent' ? 'border-accent/40 bg-accent-weak' : 'border-border-strong bg-bg-raised',
        // Without motion the two faces simply stack and one is hidden; with it, the back face is
        // pre-rotated so the flip lands on it.
        back && !reduced && 'absolute inset-0 [transform:rotateY(180deg)]',
        back && reduced && 'absolute inset-0',
        hidden && 'invisible',
      )}
    >
      <span className="font-sans text-xs font-medium tracking-wider text-text-muted uppercase">
        {label}
      </span>
      <span className="lumen-note text-md leading-note text-text">{children}</span>
    </div>
  );
}
