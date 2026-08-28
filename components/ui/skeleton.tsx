import { cn } from '@/lib/utils/cn';

export interface SkeletonProps {
  className?: string;
  /** `text` gets a line-height-ish height so a stack of them looks like a paragraph. */
  variant?: 'text' | 'block';
}

/**
 * The placeholder for content that is on its way. It breathes rather than shimmers — a sweeping
 * gradient reads as "stuck", a slow fade reads as "working" (03-DESIGN.md §7).
 *
 * Never announce these: the region they live in carries the `aria-busy` and the status line.
 */
export function Skeleton({ className, variant = 'block' }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-breathe rounded-note bg-bg-sunken',
        variant === 'text' && 'h-3.5',
        className,
      )}
    />
  );
}

/** A paragraph's worth of skeleton lines, with a short last line so it reads as prose. */
export function SkeletonParagraph({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} variant="text" className={index === lines - 1 ? 'w-2/3' : 'w-full'} />
      ))}
    </div>
  );
}
