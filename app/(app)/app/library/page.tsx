import type { Metadata } from 'next';

import { LibraryScreen } from '@/lib/app/screens/library-screen';

export const metadata: Metadata = {
  title: 'Library',
  robots: { index: false, follow: false },
};

export default function LibraryPage() {
  return <LibraryScreen />;
}
