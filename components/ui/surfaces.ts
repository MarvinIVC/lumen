import { cn } from '@/lib/utils/cn';

/**
 * The two raised surfaces, in one place. 03-DESIGN.md §4 allows exactly two elevation levels and
 * says borders do the structural work — in dark, the border plus a lifted background *is* the
 * elevation, which is why both surfaces carry a hairline rather than relying on the shadow.
 */

/** Menus, popovers, tooltip-sized things. */
export const overlaySurface = cn(
  'rounded-md border border-border bg-bg-raised text-text shadow-card',
);

/** Dialogs, drawers, the command menu — the things that take over the screen. */
export const dialogSurface = cn(
  'rounded-lg border border-border bg-bg-raised text-text shadow-overlay',
);

/** The scrim behind a dialog. Warm, not blue-black, and never fully opaque. */
export const scrim = cn('fixed inset-0 z-50 bg-text/25 backdrop-blur-xs');
