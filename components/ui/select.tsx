'use client';

import { Select as RadixSelect } from 'radix-ui';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

import { CheckIcon, ChevronDownIcon } from './icons';
import { useFieldControl } from './field';
import { overlaySurface } from './surfaces';

export const SelectRoot = RadixSelect.Root;
export const SelectGroup = RadixSelect.Group;

export interface SelectProps extends ComponentPropsWithoutRef<typeof RadixSelect.Root> {
  placeholder?: string;
  /** Falls back to the `<Field>` label when there is one. */
  'aria-label'?: string;
  triggerClassName?: string;
  children: ReactNode;
}

/**
 * A native `<select>` cannot be styled to match the rest of the kit on every platform, so this is
 * Radix's listbox — with the same shell as `Input` so a form of mixed controls lines up.
 */
export function Select({
  placeholder,
  triggerClassName,
  children,
  'aria-label': ariaLabel,
  ...props
}: SelectProps) {
  const field = useFieldControl();

  return (
    <RadixSelect.Root {...props}>
      <RadixSelect.Trigger
        {...field}
        aria-label={ariaLabel}
        className={cn(
          'inline-flex h-10 w-full items-center justify-between gap-2 rounded-sm px-3',
          'border border-border-strong bg-bg-raised text-sm text-text',
          'transition-colors duration-(--dur-fast) ease-lumen hover:border-text-faint',
          'data-placeholder:text-text-muted',
          'disabled:cursor-not-allowed disabled:bg-bg-sunken disabled:text-text-muted',
          'aria-invalid:border-danger',
          triggerClassName,
        )}
      >
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon className="text-base text-text-muted">
          <ChevronDownIcon />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={6}
          className={cn(
            overlaySurface,
            'z-50 max-h-72 min-w-(--radix-select-trigger-width) popover-motion overflow-hidden',
          )}
        >
          <RadixSelect.Viewport className="p-1">{children}</RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}

export function SelectItem({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<typeof RadixSelect.Item>) {
  return (
    <RadixSelect.Item
      className={cn(
        'relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-7 select-none',
        'text-sm text-text outline-none',
        'data-highlighted:bg-bg-sunken',
        'data-[state=checked]:font-medium',
        'data-disabled:pointer-events-none data-disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <RadixSelect.ItemIndicator className="absolute left-2 text-xs text-accent">
        <CheckIcon className="size-3.5" />
      </RadixSelect.ItemIndicator>
      <RadixSelect.ItemText>{children}</RadixSelect.ItemText>
    </RadixSelect.Item>
  );
}

export function SelectLabel({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof RadixSelect.Label>) {
  return (
    <RadixSelect.Label
      className={cn('px-2 py-1.5 text-xs font-medium tracking-wide text-text-muted', className)}
      {...props}
    />
  );
}

export function SelectSeparator({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof RadixSelect.Separator>) {
  return <RadixSelect.Separator className={cn('my-1 h-px bg-border', className)} {...props} />;
}
