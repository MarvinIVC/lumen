'use client';

import { Tabs as RadixTabs } from 'radix-ui';
import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils/cn';

export const Tabs = RadixTabs.Root;

export type TabsVariant = 'underline' | 'segmented';

/**
 * Two shapes for two jobs: `underline` for navigating between views (a rule, no box), `segmented`
 * for switching a setting in place — which is the shape `OptionsPanel` and the reading-mode
 * toggle both use.
 */
export function TabsList({
  variant = 'underline',
  className,
  ...props
}: ComponentPropsWithoutRef<typeof RadixTabs.List> & { variant?: TabsVariant }) {
  return (
    <RadixTabs.List
      data-variant={variant}
      className={cn(
        'inline-flex items-center',
        variant === 'underline' && 'gap-5 border-b border-border',
        variant === 'segmented' && 'gap-0.5 rounded-md border border-border bg-bg-sunken p-0.5',
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  variant = 'underline',
  className,
  ...props
}: ComponentPropsWithoutRef<typeof RadixTabs.Trigger> & { variant?: TabsVariant }) {
  return (
    <RadixTabs.Trigger
      className={cn(
        'inline-flex items-center justify-center text-sm whitespace-nowrap text-text-muted',
        'transition-colors duration-(--dur-fast) ease-lumen hover:text-text',
        'disabled:pointer-events-none disabled:opacity-50',
        variant === 'underline' &&
          cn(
            '-mb-px border-b-2 border-transparent pb-2.5',
            'data-[state=active]:border-accent data-[state=active]:text-text',
          ),
        variant === 'segmented' &&
          cn(
            'flex-1 rounded-sm px-3 py-1.5',
            'data-[state=active]:bg-bg-raised data-[state=active]:font-medium',
            'data-[state=active]:text-text data-[state=active]:shadow-card',
          ),
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof RadixTabs.Content>) {
  return <RadixTabs.Content className={cn('mt-4 outline-none', className)} {...props} />;
}
