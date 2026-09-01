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
import type { Block, MarginNoteBlock, NoteDocument, Section } from '@/lib/ai/schema';

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
  const taken = new Set(collectBlocks(doc).map((block) => block.id));
  let next = 0;
  let candidate = `${sectionId}-n${next}`;
  while (taken.has(candidate)) candidate = `${sectionId}-n${++next}`;
  return candidate;
}

/** Every block in reading order, sections flattened. */
export function collectBlocks(doc: NoteDocument): Block[] {
  return doc.sections.flatMap((section) => section.blocks);
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

/** The section a block belongs to — what "regenerate this" and the corrections links need. */
export function sectionOf(doc: NoteDocument, blockId: string): Section | null {
  return findBlock(doc, blockId)?.section ?? null;
}

/**
 * Resolves a margin note's anchor to a block id, falling back to source order.
 *
 * `MarginNoteBlock.anchorId` has been in the schema since phase-00 and has been unusable since
 * phase-00, because there was nothing for it to point at — `NoteDocument.tsx` says as much and
 * attaches notes to the block they follow instead. With ids it finally works, and the fallback
 * stays because the model still does not populate it: source order is what the gold fixture and
 * every deployed run actually rely on.
 */
export function anchorTarget(section: Section, note: MarginNoteBlock): string | null {
  if (note.anchorId && section.blocks.some((block) => block.id === note.anchorId)) {
    return note.anchorId;
  }
  const index = section.blocks.indexOf(note);
  for (let i = index - 1; i >= 0; i -= 1) {
    const candidate = section.blocks[i];
    if (candidate && candidate.type !== 'marginNote') return candidate.id ?? null;
  }
  return null;
}
