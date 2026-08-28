import type { Metadata } from 'next';

import { NoteDocument } from '@/lib/render/NoteDocument';
import { goldFixture } from '@/lib/render/fixture/gold';

export const metadata: Metadata = { title: 'Gold fixture' };

/**
 * Hero screen 1: `fixtures/ap-chem-u1-gold.md` rendered through the real `NoteDocument`.
 *
 * This is the page the phase is judged on — if it does not look like a page out of a well-made
 * textbook, the design system is not done.
 */
export default function GoldFixturePage() {
  return <NoteDocument doc={goldFixture()} />;
}
