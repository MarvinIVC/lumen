'use client';

import type { TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/utils/cn';

import { controlSurface, useFieldControl } from './field';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Serif + a reading measure, for anything that is note *content* rather than a form value. */
  prose?: boolean;
}

export function Textarea({ prose = false, className, rows = 4, ...props }: TextareaProps) {
  const field = useFieldControl();

  return (
    <textarea
      {...field}
      rows={rows}
      className={cn(
        controlSurface,
        'resize-y px-3 py-2 text-sm',
        prose && 'font-serif text-md leading-note',
        className,
      )}
      {...props}
    />
  );
}
