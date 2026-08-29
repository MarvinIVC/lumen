'use client';

import { Slot } from 'radix-ui';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

import { BUTTON_BASE, BUTTON_SIZES, BUTTON_VARIANTS } from './button-styles';
import type { ButtonSize, ButtonVariant } from './button-styles';
import { Spinner } from './spinner';

export type { ButtonSize, ButtonVariant };

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
      // `disabled` is not a valid attribute on an anchor, so with `asChild` the styling would say
      // disabled and the element would still be clickable and still be in the tab order. The
      // ARIA equivalent plus the class below is what actually holds.
      disabled={asChild ? undefined : disabled || loading}
      aria-disabled={asChild && (disabled || loading) ? true : undefined}
      tabIndex={asChild && (disabled || loading) ? -1 : undefined}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      className={cn(
        BUTTON_BASE,
        BUTTON_SIZES[size],
        BUTTON_VARIANTS[variant],
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
