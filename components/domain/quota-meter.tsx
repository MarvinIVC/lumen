'use client';

import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils/cn';

export interface QuotaMeterProps {
  used: number;
  total: number;
  /** When the allowance comes back, in the user's words: "midnight", "in 4 hours". */
  resetsIn?: string;
  /** True once the user has supplied their own API key — the daily cap stops applying. */
  ownKey?: boolean;
  className?: string;
}

/**
 * How much free generation is left today (02-ARCHITECTURE.md §7).
 *
 * The copy leads with what remains rather than what is spent — "3 study guides left today" is the
 * fact a student is actually asking for, and it is the phrasing 01-PRODUCT.md §6 uses. The bar
 * changes tone as it fills so the state is not carried by the number alone.
 */
export function QuotaMeter({ used, total, resetsIn, ownKey = false, className }: QuotaMeterProps) {
  const left = Math.max(0, total - used);
  const percent = total > 0 ? (used / total) * 100 : 0;
  const tone = left === 0 ? 'danger' : percent >= 75 ? 'warning' : 'accent';

  if (ownKey) {
    return (
      <div className={cn('flex flex-col gap-1 font-sans', className)}>
        <p className="text-sm text-text">Using your own key</p>
        <p className="text-xs text-text-muted">
          No daily limit. You are billed by your provider, not by us.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-1.5 font-sans', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-text">
          {left === 0
            ? 'No free study guides left today'
            : `${left} free ${left === 1 ? 'study guide' : 'study guides'} left today`}
        </p>
        <p className="text-xs text-text-muted tabular-nums">
          {used}/{total}
        </p>
      </div>
      <Progress value={percent} tone={tone} label={`${left} of ${total} remaining today`} />
      {resetsIn ? (
        <p className="text-xs text-text-muted">
          {left === 0 ? `Resets ${resetsIn}. ` : `Resets ${resetsIn}.`}
          {left === 0 ? 'You can add your own API key to keep going now.' : null}
        </p>
      ) : null}
    </div>
  );
}
