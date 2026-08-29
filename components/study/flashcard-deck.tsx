'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ChevronRightIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils/cn';
import type { Flashcard as FlashcardType } from '@/lib/ai/schema';

import { Flashcard } from './flashcard';

export interface FlashcardDeckProps {
  cards: FlashcardType[];
  className?: string;
}

/**
 * A deck, one card at a time (03-DESIGN.md §5). Shell: phase-08 adds scheduling and what the
 * student got right. The position line is a live region so a keyboard user knows they moved.
 */
export function FlashcardDeck({ cards, className }: FlashcardDeckProps) {
  const [index, setIndex] = useState(0);
  const card = cards[index];

  if (!card) return null;

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <Progress
        value={((index + 1) / cards.length) * 100}
        label={`Card ${index + 1} of ${cards.length}`}
      />

      {/* Keyed so the next card starts face-up rather than inheriting the last one's flip. */}
      <Flashcard key={index} card={card} />

      <div className="flex items-center justify-between gap-3 font-sans">
        <Button
          size="sm"
          variant="ghost"
          disabled={index === 0}
          onClick={() => setIndex((value) => value - 1)}
        >
          Back
        </Button>
        <p className="text-sm text-text-muted tabular-nums" aria-live="polite">
          {index + 1} of {cards.length}
        </p>
        <Button
          size="sm"
          trailing={<ChevronRightIcon />}
          disabled={index === cards.length - 1}
          onClick={() => setIndex((value) => value + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
