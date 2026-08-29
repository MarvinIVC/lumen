'use client';

import { RadioGroup as RadixRadioGroup } from 'radix-ui';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { useId } from 'react';

import { cn } from '@/lib/utils/cn';

export type RadioGroupProps = ComponentPropsWithoutRef<typeof RadixRadioGroup.Root>;

export function RadioGroup({ className, ...props }: RadioGroupProps) {
  return <RadixRadioGroup.Root className={cn('flex flex-col gap-2.5', className)} {...props} />;
}

export interface RadioProps extends ComponentPropsWithoutRef<typeof RadixRadioGroup.Item> {
  label: ReactNode;
  hint?: ReactNode;
}

export function Radio({ label, hint, className, id, ...props }: RadioProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const labelId = `${controlId}-label`;

  return (
    <div className="flex items-start gap-2.5">
      <RadixRadioGroup.Item
        id={controlId}
        // Radix renders the item as a <button role="radio">, which a `<label for>` does not
        // reliably name. Pointing at the label explicitly fixes that — except when the label is
        // rendered maths, whose text lives in MathML that an accessible-name computation will not
        // reach into. A caller with a maths label passes `aria-label` and that wins.
        aria-labelledby={props['aria-label'] ? undefined : labelId}
        aria-describedby={hintId}
        className={cn(
          'grid size-4.5 shrink-0 place-items-center rounded-full border border-border-strong',
          'bg-bg-raised transition-colors duration-(--dur-fast) ease-lumen',
          'hover:border-text-faint',
          'data-[state=checked]:border-accent',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      >
        <RadixRadioGroup.Indicator className="size-2.5 rounded-full bg-accent" />
      </RadixRadioGroup.Item>
      <div className="flex flex-col gap-0.5">
        <label id={labelId} htmlFor={controlId} className="text-sm leading-snug text-text">
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
