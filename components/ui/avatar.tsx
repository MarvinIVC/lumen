'use client';

import { Avatar as RadixAvatar } from 'radix-ui';

import { cn } from '@/lib/utils/cn';

export interface AvatarProps {
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: 'size-6 text-xs',
  md: 'size-8 text-sm',
  lg: 'size-10 text-base',
} as const;

/** First letters of the first two words — "Marvin Wang" → "MW", "chemistry" → "C". */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  return (
    <RadixAvatar.Root
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden select-none',
        'rounded-full border border-border bg-accent-weak',
        SIZES[size],
        className,
      )}
    >
      {src ? <RadixAvatar.Image src={src} alt="" className="size-full object-cover" /> : null}
      <RadixAvatar.Fallback
        // The name belongs to the surrounding row, not to the monogram; announcing "MW" adds
        // nothing a screen reader user needs.
        aria-hidden="true"
        delayMs={src ? 300 : 0}
        className="font-medium text-accent"
      >
        {initials(name)}
      </RadixAvatar.Fallback>
    </RadixAvatar.Root>
  );
}
