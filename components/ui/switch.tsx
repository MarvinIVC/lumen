'use client';

import { Switch as RadixSwitch } from 'radix-ui';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { useId } from 'react';

import { cn } from '@/lib/utils/cn';

export interface SwitchProps extends ComponentPropsWithoutRef<typeof RadixSwitch.Root> {
  label?: ReactNode;
  hint?: ReactNode;
  /** Puts the label first and the control hard right — the settings-row shape. */
  justified?: boolean;
}

export function Switch({ label, hint, justified = false, className, id, ...props }: SwitchProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;

  const control = (
    <RadixSwitch.Root
      id={controlId}
      aria-describedby={hintId}
      className={cn(
        'relative inline-flex h-5.5 w-9.5 shrink-0 items-center rounded-full border',
        'border-border-strong bg-bg-sunken transition-colors duration-(--dur-fast) ease-lumen',
        'data-[state=checked]:border-accent data-[state=checked]:bg-accent',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <RadixSwitch.Thumb
        className={cn(
          'block size-4 translate-x-0.5 rounded-full bg-bg-raised shadow-card',
          'transition-transform duration-(--dur-fast) ease-lumen',
          'data-[state=checked]:translate-x-4.5',
        )}
      />
    </RadixSwitch.Root>
  );

  if (!label) return control;

  return (
    <div className={cn('flex items-start gap-3', justified && 'w-full justify-between')}>
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
      {control}
    </div>
  );
}
