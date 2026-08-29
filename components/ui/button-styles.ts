import { cn } from '@/lib/utils/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Four variants, and the restraint is the design (03-DESIGN.md §1): one filled accent button per
 * screen, secondary carries a hairline, ghost carries nothing until you point at it.
 */
export const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover active:bg-accent-hover',
  secondary:
    'border border-border-strong bg-bg-raised text-text hover:bg-bg-sunken active:bg-bg-sunken',
  ghost: 'text-text-muted hover:bg-bg-sunken hover:text-text active:bg-bg-sunken',
  danger: 'bg-danger text-danger-fg hover:bg-danger-hover active:bg-danger-hover',
};

export const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 rounded-sm px-3 text-sm',
  md: 'h-10 gap-2 rounded-md px-4 text-sm',
  lg: 'h-12 gap-2 rounded-md px-5 text-base',
};

export const BUTTON_BASE = [
  'inline-flex shrink-0 items-center justify-center whitespace-nowrap select-none',
  'font-medium transition-colors duration-(--dur-fast) ease-lumen',
  'disabled:pointer-events-none disabled:opacity-50',
  'aria-disabled:pointer-events-none aria-disabled:opacity-50',
].join(' ');

/**
 * A button's classes without the button.
 *
 * `<Button asChild>` around a link is the right tool inside the app, but it is a client component
 * and it drags Radix's Slot and the spinner in with it. The marketing pages have a JS budget
 * measured in single-digit kilobytes and their calls to action are ordinary anchors, so they take
 * the classes and skip the runtime — while still resolving to the same source of truth, so the
 * landing page's primary button cannot drift from the app's.
 */
export function buttonClass(
  options: {
    variant?: ButtonVariant;
    size?: ButtonSize;
    fullWidth?: boolean;
    className?: string;
  } = {},
): string {
  const { variant = 'secondary', size = 'md', fullWidth = false, className } = options;
  return cn(
    BUTTON_BASE,
    BUTTON_SIZES[size],
    BUTTON_VARIANTS[variant],
    fullWidth && 'w-full',
    className,
  );
}
