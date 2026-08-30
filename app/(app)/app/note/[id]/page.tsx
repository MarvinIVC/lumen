import type { Metadata } from 'next';

import { NoteScreen } from '@/lib/app/screens/note-screen';

export const metadata: Metadata = {
  title: 'Your note',
  robots: { index: false, follow: false },
};

/**
 * The note lives in IndexedDB on the student's own device, so the server has nothing to look up
 * and nothing to prerender — the id is passed straight through to the client and read there.
 */
export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NoteScreen noteId={id} />;
}
