'use client';

import { Slider as RadixSlider } from 'radix-ui';
import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils/cn';

export interface SliderProps extends ComponentPropsWithoutRef<typeof RadixSlider.Root> {
  /** One accessible name per thumb. Required — a nameless slider is unusable by keyboard. */
  thumbLabels: string[];
}

export function Slider({ thumbLabels, className, ...props }: SliderProps) {
  return (
    <RadixSlider.Root
      className={cn(
        'relative flex w-full touch-none items-center select-none',
        'data-[orientation=vertical]:h-40 data-[orientation=vertical]:w-auto',
        'data-[orientation=vertical]:flex-col',
        className,
      )}
      {...props}
    >
      <RadixSlider.Track className="relative h-1 w-full grow rounded-full bg-bg-sunken">
        <RadixSlider.Range className="absolute h-full rounded-full bg-accent" />
      </RadixSlider.Track>
      {thumbLabels.map((label) => (
        <RadixSlider.Thumb
          key={label}
          aria-label={label}
          className={cn(
            'block size-4 rounded-full border border-accent bg-bg-raised shadow-card',
            'transition-colors duration-(--dur-fast) ease-lumen',
            'hover:bg-accent-weak',
          )}
        />
      ))}
    </RadixSlider.Root>
  );
}
