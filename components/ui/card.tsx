import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

export interface CardProps {
  children: ReactNode;
  /** Lifts on hover — for a card that is itself a link or button. */
  interactive?: boolean;
  /** `sunken` for a quiet inset panel (a definition, a code sample), `raised` for a real card. */
  surface?: 'raised' | 'sunken';
  padding?: 'none' | 'sm' | 'md';
  className?: string;
}

const PADDING = { none: '', sm: 'p-3', md: 'p-4' } as const;

export function Card({
  children,
  interactive = false,
  surface = 'raised',
  padding = 'md',
  className,
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-md border border-border',
        surface === 'raised' ? 'bg-bg-raised' : 'bg-bg-sunken',
        interactive &&
          cn(
            'transition-[box-shadow,border-color] duration-(--dur-fast) ease-lumen',
            'hover:border-border-strong hover:shadow-card',
            'focus-within:border-border-strong',
          ),
        PADDING[padding],
        className,
      )}
    >
      {children}
    </div>
  );
}
