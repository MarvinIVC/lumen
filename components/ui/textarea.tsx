'use client';

import type { ComponentPropsWithRef } from 'react';

import { cn } from '@/lib/utils/cn';

import { controlSurface, useFieldControl } from './field';

/**
 * `ComponentPropsWithRef`, not `TextareaHTMLAttributes`: React 19 passes `ref` as an ordinary
 * prop, and the review screen's auto-sizing block needs one to measure `scrollHeight`. It is
 * spread onto the element below with everything else, so nothing has to be forwarded.
 */
export interface TextareaProps extends ComponentPropsWithRef<'textarea'> {
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
