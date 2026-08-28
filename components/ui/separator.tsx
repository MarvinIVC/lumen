'use client';

import { Separator as RadixSeparator } from 'radix-ui';
import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils/cn';

/** A 1px hairline. 03-DESIGN.md §4: borders do the structural work, so this earns its keep. */
export function Separator({
  className,
  orientation = 'horizontal',
  ...props
}: ComponentPropsWithoutRef<typeof RadixSeparator.Root>) {
  return (
    <RadixSeparator.Root
      orientation={orientation}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  );
}
