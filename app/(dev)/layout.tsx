import { notFound } from 'next/navigation';

import { devScreensEnabled } from '@/lib/config';
import { ToastProvider } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';

/**
 * The `/dev` screens: the three proofs for phase-01, built on real fixture data before there is a
 * pipeline behind them. They are also where the print stylesheet is verified.
 *
 * Not shipped. The route group exists so these pages can use the real providers and the real
 * renderer rather than a Storybook approximation of them — but a design harness is not something
 * users should be able to walk into, so production has no such page.
 */
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (!devScreensEnabled()) notFound();

  return (
    <TooltipProvider delayDuration={200}>
      <ToastProvider>{children}</ToastProvider>
    </TooltipProvider>
  );
}
