'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

import { Spinner } from './spinner';
import type { ButtonSize, ButtonVariant } from './button';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  secondary: 'border border-border-strong bg-bg-raised text-text hover:bg-bg-sunken',
  ghost: 'text-text-muted hover:bg-bg-sunken hover:text-text',
  danger: 'bg-danger text-danger-fg hover:bg-danger-hover',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'size-8 rounded-sm text-base',
  md: 'size-10 rounded-md text-md',
  lg: 'size-12 rounded-md text-lg',
};

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /**
   * The accessible name — required, not optional. An icon-only control with no name is the single
   * most common a11y failure in a component kit, so the type system refuses to let it happen.
   */
  label: string;
  icon: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function IconButton({
  label,
  icon,
  variant = 'ghost',
  size = 'md',
  loading = false,
  className,
  disabled,
  type,
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      aria-label={label}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        'transition-colors duration-(--dur-fast) ease-lumen',
        'disabled:pointer-events-none disabled:opacity-50',
        SIZES[size],
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner size={size === 'sm' ? 'sm' : 'md'} label={null} /> : icon}
    </button>
  );
}
