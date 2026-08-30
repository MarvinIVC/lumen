import type { Metadata } from 'next';

import { HubScreen } from '@/lib/app/screens/hub-screen';

export const metadata: Metadata = {
  title: 'Workspace',
  robots: { index: false, follow: false },
};

export default function AppPage() {
  return <HubScreen />;
}
