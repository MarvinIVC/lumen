'use client';

import { Slot } from 'radix-ui';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

import { Spinner } from './spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Four variants, and the restraint is the design (03-DESIGN.md §1): one filled accent button per
 * screen, secondary carries a hairline, ghost carries nothing until you point at it.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover active:bg-accent-hover',
  secondary:
    'border border-border-strong bg-bg-raised text-text hover:bg-bg-sunken active:bg-bg-sunken',
  ghost: 'text-text-muted hover:bg-bg-sunken hover:text-text active:bg-bg-sunken',
  danger: 'bg-danger text-danger-fg hover:bg-danger-hover active:bg-danger-hover',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 rounded-sm px-3 text-sm',
  md: 'h-10 gap-2 rounded-md px-4 text-sm',
  lg: 'h-12 gap-2 rounded-md px-5 text-base',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Swaps the leading slot for a spinner and blocks interaction. Keeps the label — width holds. */
  loading?: boolean;
  /** Rendered before the label; hidden while `loading`. */
  icon?: ReactNode;
  /** Rendered after the label. A chevron, a count — never a second action. */
  trailing?: ReactNode;
  fullWidth?: boolean;
  /**
   * Render as the child element instead of a `<button>` — for a link that should look like a
   * button. The child must accept a ref and take the className.
   */
  asChild?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  trailing,
  fullWidth = false,
  asChild = false,
  className,
  children,
  disabled,
  type,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot.Root : 'button';

  const leading = loading ? (
    <Spinner size={size === 'lg' ? 'md' : 'sm'} label={null} />
  ) : icon ? (
    <span aria-hidden="true" className="text-md leading-none">
      {icon}
    </span>
  ) : null;

  return (
    <Component
      // A button inside a form defaults to submitting it, which is almost never what the caller
      // meant. `asChild` has no implicit type to correct.
      type={asChild ? undefined : (type ?? 'button')}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center whitespace-nowrap select-none',
        'font-medium transition-colors duration-(--dur-fast) ease-lumen',
        'disabled:pointer-events-none disabled:opacity-50',
        SIZES[size],
        VARIANTS[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {leading}
      {/*
        With `asChild`, Slot merges into a single element child — so the label has to be marked as
        that element and the icons handed to it as extra content. Without `Slottable` a button
        that has both an icon and `asChild` throws at render.
      */}
      {asChild ? <Slot.Slottable>{children}</Slot.Slottable> : children}
      {trailing ? (
        <span aria-hidden="true" className="text-md leading-none opacity-70">
          {trailing}
        </span>
      ) : null}
    </Component>
  );
}
