'use client';

import { DropdownMenu as RadixDropdownMenu } from 'radix-ui';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

import { CheckIcon, ChevronRightIcon } from './icons';
import { overlaySurface } from './surfaces';

export const DropdownMenu = RadixDropdownMenu.Root;
export const DropdownMenuTrigger = RadixDropdownMenu.Trigger;
export const DropdownMenuGroup = RadixDropdownMenu.Group;
export const DropdownMenuSub = RadixDropdownMenu.Sub;
export const DropdownMenuRadioGroup = RadixDropdownMenu.RadioGroup;

const itemBase = cn(
  'relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5',
  'text-sm text-text outline-none transition-colors duration-(--dur-fast) ease-lumen',
  'data-highlighted:bg-bg-sunken',
  'data-disabled:pointer-events-none data-disabled:opacity-50',
);

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentPropsWithoutRef<typeof RadixDropdownMenu.Content>) {
  return (
    <RadixDropdownMenu.Portal>
      <RadixDropdownMenu.Content
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(overlaySurface, 'z-50 min-w-48 popover-motion p-1', className)}
        {...props}
      />
    </RadixDropdownMenu.Portal>
  );
}

export function DropdownMenuItem({
  className,
  icon,
  shortcut,
  danger = false,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof RadixDropdownMenu.Item> & {
  icon?: ReactNode;
  shortcut?: string;
  danger?: boolean;
}) {
  return (
    <RadixDropdownMenu.Item
      className={cn(itemBase, danger && 'text-danger data-highlighted:bg-danger/10', className)}
      {...props}
    >
      {icon ? (
        <span aria-hidden="true" className="text-base text-text-muted">
          {icon}
        </span>
      ) : null}
      <span className="flex-1">{children}</span>
      {shortcut ? <span className="text-xs tracking-wide text-text-muted">{shortcut}</span> : null}
    </RadixDropdownMenu.Item>
  );
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof RadixDropdownMenu.CheckboxItem>) {
  return (
    <RadixDropdownMenu.CheckboxItem className={cn(itemBase, 'pl-7', className)} {...props}>
      <RadixDropdownMenu.ItemIndicator className="absolute left-2 text-accent">
        <CheckIcon className="size-3.5" />
      </RadixDropdownMenu.ItemIndicator>
      {children}
    </RadixDropdownMenu.CheckboxItem>
  );
}

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof RadixDropdownMenu.RadioItem>) {
  return (
    <RadixDropdownMenu.RadioItem className={cn(itemBase, 'pl-7', className)} {...props}>
      <RadixDropdownMenu.ItemIndicator className="absolute left-2.5 text-accent">
        <span className="block size-2 rounded-full bg-current" />
      </RadixDropdownMenu.ItemIndicator>
      {children}
    </RadixDropdownMenu.RadioItem>
  );
}

export function DropdownMenuSubTrigger({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof RadixDropdownMenu.SubTrigger>) {
  return (
    <RadixDropdownMenu.SubTrigger className={cn(itemBase, className)} {...props}>
      <span className="flex-1">{children}</span>
      <ChevronRightIcon className="text-base text-text-muted" />
    </RadixDropdownMenu.SubTrigger>
  );
}

export function DropdownMenuSubContent({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof RadixDropdownMenu.SubContent>) {
  return (
    <RadixDropdownMenu.Portal>
      <RadixDropdownMenu.SubContent
        className={cn(overlaySurface, 'z-50 min-w-44 popover-motion p-1', className)}
        {...props}
      />
    </RadixDropdownMenu.Portal>
  );
}

export function DropdownMenuLabel({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof RadixDropdownMenu.Label>) {
  return (
    <RadixDropdownMenu.Label
      className={cn('px-2 py-1.5 text-xs font-medium tracking-wide text-text-muted', className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof RadixDropdownMenu.Separator>) {
  return (
    <RadixDropdownMenu.Separator className={cn('my-1 h-px bg-border', className)} {...props} />
  );
}
