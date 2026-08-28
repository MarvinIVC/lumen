'use client';

import { Checkbox as RadixCheckbox } from 'radix-ui';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { useId } from 'react';

import { cn } from '@/lib/utils/cn';

import { CheckIcon } from './icons';

export interface CheckboxProps extends ComponentPropsWithoutRef<typeof RadixCheckbox.Root> {
  /** Rendered as a real `<label>` beside the box, so the whole row is a hit target. */
  label?: ReactNode;
  /** A second, quieter line under the label. */
  hint?: ReactNode;
}

export function Checkbox({ label, hint, className, id, ...props }: CheckboxProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;

  const box = (
    <RadixCheckbox.Root
      id={controlId}
      aria-describedby={hintId}
      className={cn(
        'grid size-4.5 shrink-0 place-items-center rounded-note border border-border-strong',
        'bg-bg-raised text-accent-fg transition-colors duration-(--dur-fast) ease-lumen',
        'hover:border-text-faint',
        'data-[state=checked]:border-accent data-[state=checked]:bg-accent',
        'data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <RadixCheckbox.Indicator className="flex items-center justify-center text-xs">
        {props.checked === 'indeterminate' ? (
          <span aria-hidden="true" className="h-px w-2.5 bg-current" />
        ) : (
          <CheckIcon className="size-3" />
        )}
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  );

  if (!label) return box;

  return (
    <div className="flex items-start gap-2.5">
      {box}
      <div className="flex flex-col gap-0.5">
        <label htmlFor={controlId} className="text-sm leading-snug text-text">
          {label}
        </label>
        {hint ? (
          <span id={hintId} className="text-xs text-text-muted">
            {hint}
          </span>
        ) : null}
      </div>
    </div>
  );
}
