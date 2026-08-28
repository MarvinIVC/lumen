'use client';

import { createContext, useContext, useId } from 'react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

/**
 * The wiring every labelled control needs and nobody remembers to write: a real `<label for>`,
 * `aria-describedby` pointing at both the hint and the error, and `aria-invalid` when there is
 * one. Controls read it from context, so `<Field label="…"><Input /></Field>` is correct by
 * construction (01-PRODUCT.md §7).
 */
interface FieldContextValue {
  controlId: string;
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/** Spread onto any control that sits inside a `<Field>`. Returns nothing useful outside one. */
export function useFieldControl(): {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
} {
  const field = useContext(FieldContext);
  if (!field) return {};
  return {
    id: field.controlId,
    ...(field.describedBy ? { 'aria-describedby': field.describedBy } : {}),
    ...(field.invalid ? { 'aria-invalid': true as const } : {}),
    ...(field.required ? { 'aria-required': true as const } : {}),
  };
}

export interface FieldProps {
  label: ReactNode;
  /** Quiet helper text under the control. Say what good input looks like, not what a field is. */
  hint?: ReactNode;
  /** Present = invalid. Says what happened and what to do next (01-PRODUCT.md §6). */
  error?: ReactNode;
  required?: boolean;
  /** Hides the label visually but keeps it for screen readers. Use sparingly. */
  labelHidden?: boolean;
  className?: string;
  children: ReactNode;
}

export function Field({
  label,
  hint,
  error,
  required = false,
  labelHidden = false,
  className,
  children,
}: FieldProps) {
  const baseId = useId();
  const controlId = `${baseId}-control`;
  const hintId = hint ? `${baseId}-hint` : undefined;
  const errorId = error ? `${baseId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <FieldContext.Provider value={{ controlId, describedBy, invalid: Boolean(error), required }}>
      <div className={cn('flex flex-col gap-1.5', className)}>
        <label
          htmlFor={controlId}
          className={cn('text-sm font-medium text-text', labelHidden && 'sr-only')}
        >
          {label}
          {required ? (
            <span className="ml-1 text-text-muted" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
        {children}
        {hint ? (
          <p id={hintId} className="text-xs text-text-muted">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p id={errorId} className="text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

/** Shared shell for text-entry controls, so Input, Textarea and Combobox cannot drift apart. */
export const controlSurface = cn(
  'w-full rounded-sm border border-border-strong bg-bg-raised text-text',
  'placeholder:text-text-muted',
  'transition-colors duration-(--dur-fast) ease-lumen',
  'hover:border-text-faint',
  'disabled:cursor-not-allowed disabled:bg-bg-sunken disabled:text-text-muted',
  'aria-invalid:border-danger',
);
