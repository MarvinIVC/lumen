'use client';

import { Toast as RadixToast } from 'radix-ui';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

import { AlertTriangleIcon, CheckIcon, InfoIcon, XIcon } from './icons';
import { IconButton } from './icon-button';

export type ToastTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface ToastOptions {
  title: string;
  /** Says what happened and what to do next (01-PRODUCT.md §6). */
  description?: string;
  tone?: ToastTone;
  /** One action, at most. A toast with two choices should have been a dialog. */
  action?: { label: string; onClick: () => void };
  duration?: number;
}

interface ToastEntry extends ToastOptions {
  id: number;
}

const ToastContext = createContext<((options: ToastOptions) => void) | null>(null);

/** `const toast = useToast(); toast({ title: '…' })`. */
export function useToast(): (options: ToastOptions) => void {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}

const TONE_ICON: Record<ToastTone, ReactNode> = {
  neutral: <InfoIcon />,
  success: <CheckIcon />,
  warning: <AlertTriangleIcon />,
  danger: <AlertTriangleIcon />,
};

const TONE_COLOR: Record<ToastTone, string> = {
  neutral: 'text-text-muted',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const push = useCallback((options: ToastOptions) => {
    setToasts((current) => [...current, { ...options, id: Date.now() + Math.random() }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      <RadixToast.Provider swipeDirection="right" duration={5000}>
        {children}
        {toasts.map((toast) => {
          const tone = toast.tone ?? 'neutral';
          return (
            <RadixToast.Root
              key={toast.id}
              duration={toast.duration}
              onOpenChange={(open) => {
                if (!open) dismiss(toast.id);
              }}
              className={cn(
                'flex popover-motion items-start gap-3 rounded-md border border-border',
                'bg-bg-raised p-3.5 shadow-overlay',
                'data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x)',
                'data-[swipe=cancel]:translate-x-0',
              )}
            >
              <span aria-hidden="true" className={cn('mt-0.5 text-base', TONE_COLOR[tone])}>
                {TONE_ICON[tone]}
              </span>
              <div className="flex flex-1 flex-col gap-1">
                <RadixToast.Title className="text-sm font-medium text-text">
                  {toast.title}
                </RadixToast.Title>
                {toast.description ? (
                  <RadixToast.Description className="text-sm leading-snug text-text-muted">
                    {toast.description}
                  </RadixToast.Description>
                ) : null}
                {toast.action ? (
                  <RadixToast.Action asChild altText={toast.action.label}>
                    <button
                      type="button"
                      onClick={toast.action.onClick}
                      className="mt-1 self-start text-sm font-medium text-accent underline-offset-2 hover:underline"
                    >
                      {toast.action.label}
                    </button>
                  </RadixToast.Action>
                ) : null}
              </div>
              <RadixToast.Close asChild>
                <IconButton label="Dismiss" icon={<XIcon />} size="sm" className="-mt-1 -mr-1" />
              </RadixToast.Close>
            </RadixToast.Root>
          );
        })}
        <RadixToast.Viewport
          className={cn(
            'fixed right-0 bottom-0 z-50 flex w-full max-w-sm flex-col gap-2 p-4 outline-none',
          )}
        />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}
