import type { Metadata } from 'next';

import { SettingsScreen } from '@/lib/app/screens/settings-screen';

export const metadata: Metadata = {
  title: 'Settings',
  robots: { index: false, follow: false },
};

/** Everything on this page is read from and written to the browser, so there is nothing to render
 *  on the server — and nothing about a student's own API key should ever pass through one. */
export default function SettingsPage() {
  return <SettingsScreen />;
}
