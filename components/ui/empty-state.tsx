import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

export interface EmptyStateProps {
  /** A line-drawn glyph from `icons.tsx`, sized up. Never an illustration (03-DESIGN.md §1). */
  icon?: ReactNode;
  title: string;
  /** Teach the next action (01-PRODUCT.md §6) — this is not the place for an apology. */
  description?: ReactNode;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  tone?: 'neutral' | 'warning' | 'danger';
  className?: string;
}

const TONES = {
  neutral: 'text-text-faint',
  warning: 'text-warning',
  danger: 'text-danger',
} as const;

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  tone = 'neutral',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-dashed border-border',
        'px-6 py-10 text-center',
        className,
      )}
    >
      {icon ? (
        <span aria-hidden="true" className={cn('text-3xl', TONES[tone])}>
          {icon}
        </span>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <p className="text-md font-medium text-text">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-sm leading-snug text-text-muted">{description}</p>
        ) : null}
      </div>
      {action || secondaryAction ? (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
