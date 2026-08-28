import { cn } from '@/lib/utils/cn';

export interface ProgressProps {
  /** 0–100. Omit for an indeterminate bar — the streaming hairline under the top bar (§7). */
  value?: number;
  label: string;
  /** `hairline` is the 2px rule under a header; `bar` is a visible track in a list row. */
  variant?: 'bar' | 'hairline';
  tone?: 'accent' | 'warning' | 'danger';
  className?: string;
}

const TONES = {
  accent: 'bg-accent',
  warning: 'bg-warning',
  danger: 'bg-danger',
} as const;

export function Progress({
  value,
  label,
  variant = 'bar',
  tone = 'accent',
  className,
}: ProgressProps) {
  const indeterminate = value === undefined;
  const clamped = indeterminate ? 0 : Math.min(100, Math.max(0, value));

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={indeterminate ? undefined : 0}
      aria-valuemax={indeterminate ? undefined : 100}
      aria-valuenow={indeterminate ? undefined : Math.round(clamped)}
      className={cn(
        'relative w-full overflow-hidden',
        variant === 'bar' ? 'h-1.5 rounded-full bg-bg-sunken' : 'h-0.5 bg-transparent',
        className,
      )}
    >
      {indeterminate ? (
        <div className={cn('h-full w-1/3 animate-indeterminate rounded-full', TONES[tone])} />
      ) : (
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-(--dur-base) ease-lumen',
            TONES[tone],
          )}
          style={{ width: `${clamped}%` }}
        />
      )}
    </div>
  );
}
