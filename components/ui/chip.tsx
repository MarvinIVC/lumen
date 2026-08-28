'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

import { XIcon } from './icons';

export interface ChipProps {
  children: ReactNode;
  icon?: ReactNode;
  /** Makes the chip a toggle. Without it the chip is a static token (a filename, a subject). */
  selected?: boolean;
  onSelect?: () => void;
  /** Adds a remove affordance. The label names what is being removed, for screen readers. */
  onRemove?: () => void;
  removeLabel?: string;
  className?: string;
}

/**
 * The interactive sibling of `Badge`: a filter, a selected subject, an attached file. Rounded
 * fully so it never gets confused with a button.
 */
export function Chip({
  children,
  icon,
  selected,
  onSelect,
  onRemove,
  removeLabel,
  className,
}: ChipProps) {
  const interactive = Boolean(onSelect);
  const Wrapper = interactive ? 'button' : 'span';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border py-1 pl-2.5 text-sm',
        onRemove ? 'pr-1' : 'pr-2.5',
        selected
          ? 'border-accent bg-accent-weak text-accent'
          : 'border-border bg-bg-raised text-text-muted',
        className,
      )}
    >
      <Wrapper
        {...(interactive
          ? { type: 'button' as const, onClick: onSelect, 'aria-pressed': Boolean(selected) }
          : {})}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full',
          interactive && 'transition-colors duration-(--dur-fast) ease-lumen hover:text-text',
        )}
      >
        {icon ? (
          <span aria-hidden="true" className="text-base">
            {icon}
          </span>
        ) : null}
        {children}
      </Wrapper>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? 'Remove'}
          className={cn(
            'grid size-5 place-items-center rounded-full text-text-muted',
            'transition-colors duration-(--dur-fast) ease-lumen hover:bg-bg-sunken hover:text-text',
          )}
        >
          <XIcon className="size-3" />
        </button>
      ) : null}
    </span>
  );
}
