'use client';

import { NoteDocument } from '@/lib/render/NoteDocument';
import { goldFixture } from '@/lib/render/fixture/gold';

/**
 * The gold fixture through the real renderer — the whole point of 03-DESIGN.md §8.4.
 *
 * This module exists only to be the target of a dynamic `import()`. Everything expensive on the
 * landing page is reachable through this one file and nothing else, which is what keeps the
 * renderer, the fixture parser, the 14 KB of fixture markdown, KaTeX, Mermaid and smiles-drawer out
 * of the first load. Import it statically from anywhere and the budget check will say so.
 */
export default function DemoNote() {
  return <NoteDocument doc={goldFixture()} />;
}
