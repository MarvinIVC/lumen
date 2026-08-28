import { cn } from '@/lib/utils/cn';

const SIZES = {
  sm: 'size-3.5',
  md: 'size-4',
  lg: 'size-5',
} as const;

export interface SpinnerProps {
  size?: keyof typeof SIZES;
  className?: string;
  /**
   * Announced to screen readers. Pass `null` when the spinner sits inside something that already
   * announces the wait (a Button with `loading`, a section with its own `aria-busy` region) —
   * two announcements for one wait is worse than none.
   */
  label?: string | null;
}

/**
 * The one indeterminate progress mark. An arc, not a ring of dots — quieter, and it reads at 14px.
 *
 * Under `prefers-reduced-motion` globals.css stops the rotation, which is correct: the arc stays
 * as a static "in progress" glyph and the accessible name does the work (03-DESIGN.md §7).
 */
export function Spinner({ size = 'md', className, label = 'Loading' }: SpinnerProps) {
  return (
    <span
      className={cn('inline-flex shrink-0', className)}
      role={label ? 'status' : undefined}
      aria-hidden={label ? undefined : true}
    >
      <svg
        className={cn('animate-spin', SIZES[size])}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={2.5} opacity={0.2} />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      </svg>
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
