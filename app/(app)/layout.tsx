import Link from 'next/link';

import { ToastProvider } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeSwitcher } from '@/components/domain/theme-switcher';
import { Wordmark } from '@/lib/marketing/chrome/wordmark';
import { APP_HOME } from '@/lib/app/routes';

/**
 * The workspace shell (01-PRODUCT.md §1: `/app/*` is the client app).
 *
 * Server component, and it stays one: everything below it is a client island, but the frame around
 * them is four elements and a link, and rendering that on the server keeps it out of the bundle.
 *
 * No marketing footer. Someone who is inside the product does not need the pitch again, and the
 * legal links they might actually want are on the workspace page rather than under every screen.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={200}>
      <ToastProvider>
        <div className="flex min-h-dvh flex-col bg-bg">
          <header className="border-b border-border">
            <div className="mx-auto flex w-full max-w-[76rem] items-center gap-4 px-5 py-3.5">
              <Link href={APP_HOME} className="mr-auto">
                <Wordmark />
              </Link>
              <ThemeSwitcher />
            </div>
          </header>
          {children}
        </div>
      </ToastProvider>
    </TooltipProvider>
  );
}
