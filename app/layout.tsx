import type { Metadata, Viewport } from 'next';

import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from '@/lib/config';
import { cloudflareAnalyticsToken } from '@/lib/analytics';
import { fontVariables } from '@/lib/design/fonts';
import { ThemeProvider } from '@/lib/design/theme-provider';
import { ThemeScript } from '@/lib/design/theme-script';
import { clientEnv } from '@/lib/env';

import './globals.css';
import { ServiceWorkerRegistrar } from './service-worker-registrar';

export const metadata: Metadata = {
  metadataBase: new URL(clientEnv.NEXT_PUBLIC_APP_URL),
  title: { default: `${APP_NAME} — ${APP_TAGLINE}`, template: `%s · ${APP_NAME}` },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: 'default' },
  icons: { icon: '/icons/icon.svg', apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Matches --bg in each theme so the browser chrome does not flash white on a dark device.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fcfbf8' },
    { media: '(prefers-color-scheme: dark)', color: '#171613' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const cfToken = cloudflareAnalyticsToken();

  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <ServiceWorkerRegistrar />
        {cfToken ? (
          <script
            defer
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={JSON.stringify({ token: cfToken })}
          />
        ) : null}
      </body>
    </html>
  );
}
