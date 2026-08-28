'use client';

import type { InputHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

import { controlSurface, useFieldControl } from './field';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** A leading glyph inside the box — a magnifier, a currency mark. Decorative only. */
  icon?: ReactNode;
  /** Trailing content inside the box: a unit, a character count, a small clear button. */
  suffix?: ReactNode;
  inputSize?: 'sm' | 'md';
}

const SIZES = {
  sm: 'h-8 text-sm',
  md: 'h-10 text-sm',
} as const;

export function Input({ icon, suffix, inputSize = 'md', className, ...props }: InputProps) {
  const field = useFieldControl();

  return (
    <div className="relative flex items-center">
      {icon ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 text-base text-text-faint"
        >
          {icon}
        </span>
      ) : null}
      <input
        {...field}
        {...props}
        className={cn(
          controlSurface,
          SIZES[inputSize],
          'px-3',
          icon && 'pl-9',
          suffix && 'pr-12',
          className,
        )}
      />
      {suffix ? <span className="absolute right-3 text-xs text-text-muted">{suffix}</span> : null}
    </div>
  );
}
