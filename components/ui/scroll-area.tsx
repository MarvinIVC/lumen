'use client';

import { ScrollArea as RadixScrollArea } from 'radix-ui';
import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils/cn';

export interface ScrollAreaProps extends ComponentPropsWithoutRef<typeof RadixScrollArea.Root> {
  /**
   * Names the scrollable region. Required because the viewport is keyboard-focusable (WCAG
   * 2.1.1: a region you can scroll but not reach is unusable without a mouse), and a focus stop
   * with no name tells the user nothing about where they have landed.
   */
  label: string;
  viewportClassName?: string;
  orientation?: 'vertical' | 'horizontal' | 'both';
}

/**
 * Used where a native scrollbar would be visually loud — the outline rail, a long menu. Content
 * that scrolls *and* must stay printable (the note body) uses the document scroll instead.
 */
export function ScrollArea({
  className,
  label,
  viewportClassName,
  orientation = 'vertical',
  children,
  ...props
}: ScrollAreaProps) {
  return (
    <RadixScrollArea.Root
      type="hover"
      className={cn('relative overflow-hidden', className)}
      {...props}
    >
      <RadixScrollArea.Viewport
        tabIndex={0}
        role="group"
        aria-label={label}
        className={cn('size-full', viewportClassName)}
      >
        {children}
      </RadixScrollArea.Viewport>
      {orientation !== 'horizontal' ? <Scrollbar orientation="vertical" /> : null}
      {orientation !== 'vertical' ? <Scrollbar orientation="horizontal" /> : null}
      <RadixScrollArea.Corner />
    </RadixScrollArea.Root>
  );
}

function Scrollbar({ orientation }: { orientation: 'vertical' | 'horizontal' }) {
  return (
    <RadixScrollArea.Scrollbar
      orientation={orientation}
      className={cn(
        'flex touch-none p-0.5 transition-colors duration-(--dur-base) ease-lumen select-none',
        orientation === 'vertical' ? 'w-2' : 'h-2 flex-col',
      )}
    >
      <RadixScrollArea.Thumb className="flex-1 rounded-full bg-border-strong" />
    </RadixScrollArea.Scrollbar>
  );
}
