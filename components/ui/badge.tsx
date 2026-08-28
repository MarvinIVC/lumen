import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'ai';

/**
 * A status mark, not a button. `ai` is the provenance tone worn by the "added" chip on a
 * generated block (03-DESIGN.md §6).
 *
 * The tone is carried by the border and the icon rather than by a saturated fill, which is both
 * the calmer look §2 asks for and the only way every tone clears 4.5:1 in both themes. `warning`
 * in particular keeps ink-colored text: `--warning` is a marker token at 3.72:1 in light, so it
 * may rule and mark but never spell out words.
 */
const TONES: Record<BadgeTone, string> = {
  neutral: 'border-border bg-bg-sunken text-text-muted',
  accent: 'border-accent/30 bg-accent-weak text-accent',
  success: 'border-success/40 bg-bg-sunken text-success',
  warning: 'border-warning/50 bg-verify text-text',
  danger: 'border-danger/40 bg-bg-sunken text-danger',
  ai: 'border-accent/30 bg-ai-added text-accent',
};

/** Only the glyph wears the marker color. */
const ICON_TONES: Record<BadgeTone, string> = {
  neutral: 'text-text-faint',
  accent: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  ai: 'text-accent',
};

export interface BadgeProps {
  tone?: BadgeTone;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Badge({ tone = 'neutral', icon, className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-note border px-1.5 py-0.5',
        'text-xs leading-none font-medium',
        TONES[tone],
        className,
      )}
    >
      {icon ? (
        <span aria-hidden="true" className={cn('text-xs', ICON_TONES[tone])}>
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}
