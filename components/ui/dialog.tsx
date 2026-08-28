'use client';

import { Dialog as RadixDialog } from 'radix-ui';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

import { IconButton } from './icon-button';
import { XIcon } from './icons';
import { dialogSurface, scrim } from './surfaces';

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

export interface DialogContentProps extends Omit<
  ComponentPropsWithoutRef<typeof RadixDialog.Content>,
  'title'
> {
  title: ReactNode;
  /**
   * Radix warns when a dialog has no description, and it is right to: a dialog that only shows a
   * title makes a screen reader user guess. Pass one, or pass `descriptionHidden` deliberately.
   */
  description?: ReactNode;
  descriptionHidden?: boolean;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
} as const;

export function DialogContent({
  title,
  description,
  descriptionHidden = false,
  footer,
  size = 'md',
  className,
  children,
  ...props
}: DialogContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className={cn(scrim, 'overlay-motion')} />
      <RadixDialog.Content
        className={cn(
          dialogSurface,
          'fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] popover-motion',
          '-translate-x-1/2 -translate-y-1/2',
          'max-h-[calc(100dvh-4rem)] overflow-y-auto',
          SIZES[size],
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 p-5 pb-0">
          <div className="flex flex-col gap-1">
            <RadixDialog.Title className="text-md font-semibold text-text">
              {title}
            </RadixDialog.Title>
            {description ? (
              <RadixDialog.Description
                className={cn('text-sm text-text-muted', descriptionHidden && 'sr-only')}
              >
                {description}
              </RadixDialog.Description>
            ) : null}
          </div>
          <RadixDialog.Close asChild>
            <IconButton label="Close" icon={<XIcon />} size="sm" className="-mt-1 -mr-1" />
          </RadixDialog.Close>
        </div>

        <div className="p-5 text-sm text-text">{children}</div>

        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
            {footer}
          </div>
        ) : null}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
