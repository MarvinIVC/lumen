'use client';

import { Popover as RadixPopover } from 'radix-ui';
import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils/cn';

import { overlaySurface } from './surfaces';

export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;
export const PopoverAnchor = RadixPopover.Anchor;
export const PopoverClose = RadixPopover.Close;

export interface PopoverContentProps extends ComponentPropsWithoutRef<typeof RadixPopover.Content> {
  /**
   * Radix gives the content `role="dialog"`, and a dialog with no name is a dead end for a
   * screen reader — so the name is required rather than merely encouraged. Pass
   * `aria-labelledby` instead when a heading inside the popover already says it.
   */
  label: string;
}

export function PopoverContent({
  className,
  label,
  sideOffset = 6,
  ...props
}: PopoverContentProps) {
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content
        aria-label={props['aria-labelledby'] ? undefined : label}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(overlaySurface, 'z-50 w-72 popover-motion p-3 outline-none', className)}
        {...props}
      />
    </RadixPopover.Portal>
  );
}
