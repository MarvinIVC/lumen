'use client';

import { Dialog as RadixDialog } from 'radix-ui';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

import { IconButton } from './icon-button';
import { XIcon } from './icons';
import { scrim } from './surfaces';

export const Drawer = RadixDialog.Root;
export const DrawerTrigger = RadixDialog.Trigger;
export const DrawerClose = RadixDialog.Close;

export interface DrawerContentProps extends Omit<
  ComponentPropsWithoutRef<typeof RadixDialog.Content>,
  'title'
> {
  title: ReactNode;
  description?: ReactNode;
  descriptionHidden?: boolean;
  /** `bottom` is the mobile sheet; `left` is the outline rail on a narrow screen. */
  side?: 'bottom' | 'left';
  footer?: ReactNode;
}

/**
 * The mobile sheet (03-DESIGN.md §5). Same dialog semantics as `Dialog` — focus trap, Esc, a
 * labelled surface — with the geometry and the motion of a sheet, plus the grab handle people
 * now expect to be able to reach for.
 */
export function DrawerContent({
  title,
  description,
  descriptionHidden = false,
  side = 'bottom',
  footer,
  className,
  children,
  ...props
}: DrawerContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className={cn(scrim, 'overlay-motion')} />
      <RadixDialog.Content
        className={cn(
          'fixed z-50 flex flex-col border-border bg-bg-raised text-text shadow-overlay',
          side === 'bottom' &&
            'inset-x-0 bottom-0 max-h-[85dvh] sheet-motion-bottom rounded-t-lg border-t',
          side === 'left' && 'inset-y-0 left-0 w-80 max-w-[85vw] sheet-motion-left border-r',
          className,
        )}
        {...props}
      >
        {side === 'bottom' ? (
          <div aria-hidden="true" className="flex justify-center pt-2.5">
            <span className="h-1 w-9 rounded-full bg-border-strong" />
          </div>
        ) : null}

        <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
          <div className="flex flex-col gap-1">
            <RadixDialog.Title className="text-md font-semibold">{title}</RadixDialog.Title>
            {description ? (
              <RadixDialog.Description
                className={cn('text-sm text-text-muted', descriptionHidden && 'sr-only')}
              >
                {description}
              </RadixDialog.Description>
            ) : null}
          </div>
          <RadixDialog.Close asChild>
            <IconButton label="Close" icon={<XIcon />} size="sm" className="-mr-1" />
          </RadixDialog.Close>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5 text-sm">{children}</div>

        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
            {footer}
          </div>
        ) : null}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
