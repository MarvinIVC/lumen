'use client';

import { useId, useRef } from 'react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Short line under the control describing what the current choice means. */
  hint?: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  className?: string;
}

/**
 * A one-of-N control that changes something *in place* — the reading mode, the depth of a
 * rebuild. It looks like a tab list on purpose (03-DESIGN.md §5) but it is not one, and the
 * difference is not cosmetic: a tab owns a panel and announces `aria-controls`, while these
 * options reshape a view that is already on screen. Built on Radix Tabs, every one of these
 * would ship a dangling `aria-controls` pointing at a panel that does not exist.
 *
 * So: a radiogroup, with roving focus — Tab enters the group once, arrows move within it.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onValueChange,
  size = 'md',
  fullWidth = false,
  className,
}: SegmentedControlProps<T>) {
  const groupId = useId();
  const container = useRef<HTMLDivElement>(null);

  const move = (direction: 1 | -1) => {
    const enabled = options.filter((option) => !option.disabled);
    const index = enabled.findIndex((option) => option.value === value);
    const next = enabled[(index + direction + enabled.length) % enabled.length];
    if (!next) return;
    onValueChange(next.value);
    // Focus follows selection, which is what a radiogroup does and what a keyboard user expects.
    container.current
      ?.querySelector<HTMLButtonElement>(`[data-value="${CSS.escape(next.value)}"]`)
      ?.focus();
  };

  return (
    <div
      ref={container}
      role="radiogroup"
      aria-label={label}
      // The group is not itself a tab stop — the selected radio is, by roving tabindex. -1 keeps
      // it programmatically focusable, which is what the lint rule is really asking for.
      tabIndex={-1}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md border border-border bg-bg-sunken p-0.5',
        fullWidth && 'flex w-full',
        className,
      )}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault();
          move(1);
        }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault();
          move(-1);
        }
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            id={`${groupId}-${option.value}`}
            type="button"
            role="radio"
            aria-checked={selected}
            data-value={option.value}
            disabled={option.disabled}
            // Roving tabindex: the group is one tab stop, arrows move inside it.
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(option.value)}
            className={cn(
              'rounded-sm whitespace-nowrap transition-colors duration-(--dur-fast) ease-lumen',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
              fullWidth && 'flex-1',
              selected
                ? 'bg-bg-raised font-medium text-text shadow-card'
                : 'text-text-muted hover:text-text',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
