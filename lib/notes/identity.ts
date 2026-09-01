/**
 * Block identity — the address every other part of the workspace is written against.
 *
 * Phase-04 shipped a schema with no id on `Block`, and the read view did not need one: it draws
 * the document top to bottom and nothing ever refers back. The workspace refers back constantly —
 * "accept *this* block", "the margin note anchored to *that* one", "the section the diff replaced",
 * "what block 7 looked like four versions ago" — and the obvious alternative, a positional path
 * like `sections[2].blocks[5]`, is wrong the instant anything is inserted or removed, which is the
 * entire activity of an editor.
 *
 * So ids are minted by us — in the validator on the way out of the pipeline, and again on load for
 * documents generated before schema 1.1.0 existed — and persisted with the document. The model is
 * never asked for them: it would be one more rule to break, the id
 * would vary per call, and an id we mint is one we can guarantee is unique — which is what every
 * `Map` keyed on it downstream is quietly assuming.
 *
 * The shape `${sectionId}-b${n}` is readable on purpose. `s-1-2-moles-b3` in a stack trace, a diff
 * or a React key tells you where you are; a nanoid does not.
 */
import { assignBlockIds } from '@/lib/ai/validate';
import type { Block, NoteDocument, Section } from '@/lib/ai/schema';

/** Where a block lives. Returned by the finders so a caller can patch without searching twice. */
export interface BlockLocation {
  sectionIndex: number;
  blockIndex: number;
  section: Section;
  block: Block;
}

/**
 * Gives every block in the document an id, leaving existing ones alone.
 *
 * The implementation is `assignBlockIds` in `lib/ai/validate.ts`, because the schema migration
 * needs it and that module is the one both Next and the Deno edge runtime can import. It is
 * re-exported under the name the workspace uses so call sites read as what they are doing rather
 * than as where the code happens to live.
 */
export const ensureBlockIds = assignBlockIds;

/**
 * A fresh id that cannot collide with anything already in the document.
 *
 * Used by the insert menu and by "ask about this" — the two places a block appears that the
 * generation never produced. Seeded off the section so the readable shape survives.
 */
export function newBlockId(doc: NoteDocument, sectionId: string): string {
  const taken = new Set(doc.sections.flatMap((section) => section.blocks.map((b) => b.id)));
  let next = 0;
  let candidate = `${sectionId}-n${next}`;
  while (taken.has(candidate)) candidate = `${sectionId}-n${++next}`;
  return candidate;
}

export function findBlock(doc: NoteDocument, id: string): BlockLocation | null {
  for (const [sectionIndex, section] of doc.sections.entries()) {
    const blockIndex = section.blocks.findIndex((block) => block.id === id);
    if (blockIndex >= 0) {
      return { sectionIndex, blockIndex, section, block: section.blocks[blockIndex] as Block };
    }
  }
  return null;
}
