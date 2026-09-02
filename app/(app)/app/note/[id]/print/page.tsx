import type { Metadata } from 'next';

import { PrintScreen } from '@/lib/app/screens/print-screen';

export const metadata: Metadata = {
  title: 'Print',
  robots: { index: false, follow: false },
};

/**
 * The note lives in IndexedDB on the student's own device, so the server has nothing to look up
 * and nothing to prerender — the id is passed straight through to the client and read there, the
 * same way `/app/note/:id` does it.
 */
export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PrintScreen noteId={id} />;
}
