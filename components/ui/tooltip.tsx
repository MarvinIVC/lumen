'use client';

import { Tooltip as RadixTooltip } from 'radix-ui';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

/** Mount once, near the root. Radix needs a provider to share the open/close delays. */
export const TooltipProvider = RadixTooltip.Provider;

export interface TooltipProps {
  /** Short. A tooltip that needs a sentence wants to be a `Popover` or a hint under the field. */
  content: ReactNode;
  children: ReactNode;
  side?: ComponentPropsWithoutRef<typeof RadixTooltip.Content>['side'];
  /** Keeps the tooltip open while the pointer is inside it — for the `ai-clarified` original text. */
  interactive?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Tooltip({
  content,
  children,
  side = 'top',
  interactive = false,
  open,
  onOpenChange,
}: TooltipProps) {
  return (
    <RadixTooltip.Root open={open} onOpenChange={onOpenChange}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          // Tooltips are hover affordances; a pointer that lands on one usually meant to keep
          // reading, so only the interactive variant lets it stay.
          onPointerDownOutside={interactive ? undefined : (event) => event.preventDefault()}
          className={cn(
            'z-50 max-w-xs popover-motion rounded-sm border border-border-strong bg-bg-raised',
            'px-2.5 py-1.5 text-xs leading-snug text-text shadow-card',
          )}
        >
          {content}
          <RadixTooltip.Arrow className="fill-bg-raised" width={10} height={5} />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
