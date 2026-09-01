/**
 * Accept and reject (phase-05 §9).
 *
 * Every AI block in a generated note is an unreviewed proposal, and this module is the only place
 * that turns one into a decision. Read view shows the proposals; the editor acts on them; both go
 * through these four functions so a bulk action and twenty individual clicks cannot disagree.
 *
 * The semantics, stated once:
 *
 *   accept  → `origin: 'student'`, `originalText` dropped. The block is theirs now. It stops being
 *             marked, stops appearing in the review queue, and stops being removable by "keep only
 *             mine" — which is the point of freezing it.
 *   reject  → `ai-added` is removed; `ai-clarified` and `ai-corrected` are put back to what the
 *             student wrote. Rejecting is not deleting: for the two origins that *replaced*
 *             something, the something has to come back, verbatim.
 *
 * Two cases that look like edge cases and are not, both measured in phase-04's deployed output:
 *
 *   One sentence, two blocks. We both tightened a student's phrasing and fixed their arithmetic,
 *   and the two blocks carry the same `originalText`. Rejecting both would print their sentence
 *   twice. So a restore that would duplicate a line already on the page deletes instead.
 *
 *   A corrected block that is not prose. `originalText` is what they wrote — "n = 0.5 x 200.6" —
 *   and it is not LaTeX, not a table and not a worked example. It comes back as a paragraph.
 */
import { computeStats } from '@/lib/ai/validate';
import type { Block, Correction, NoteDocument, ParagraphBlock } from '@/lib/ai/schema';

import { toMyOriginal } from './reading';

/** The blocks still awaiting a decision, in reading order — the review queue's contents. */
export function pendingAiBlocks(doc: NoteDocument): Block[] {
  return doc.sections.flatMap((section) =>
    section.blocks.filter((block) => block.origin !== 'student'),
  );
}

export function acceptBlock(doc: NoteDocument, blockId: string): NoteDocument {
  return restat(mapBlocks(doc, (block) => (block.id === blockId ? [accepted(block)] : [block])));
}

/**
 * Rejects one block.
 *
 * The `corrections[]` entry that described the change goes with it. Leaving it behind would put a
 * "you wrote X → should be Y" card under a document that now says X — a panel confidently
 * describing an edit that is no longer there.
 */
export function rejectBlock(doc: NoteDocument, blockId: string): NoteDocument {
  const target = doc.sections
    .flatMap((section) => section.blocks)
    .find((block) => block.id === blockId);
  if (!target) return doc;

  const onPage = studentLines(doc);
  const next = mapBlocks(doc, (block) => (block.id === blockId ? restore(block, onPage) : [block]));

  return restat({ ...next, corrections: withoutCorrectionFor(next.corrections, target) });
}

/** Everything we proposed becomes theirs. Corrections stay: the panel is a record, not a queue. */
export function acceptAll(doc: NoteDocument): NoteDocument {
  return restat(mapBlocks(doc, (block) => [accepted(block)]));
}

/**
 * "Keep only mine" — the document reduced to the student's own content.
 *
 * Deliberately the same transform as the "My original" reading mode, applied for real instead of
 * for display: the summary, the objectives and the appendices are things we wrote, and a student
 * who has just said they want only their own work should not be left with our one-paragraph
 * summary at the top of it. A view and its destructive twin producing different documents would
 * be its own bug report.
 */
export function keepOnlyMine(doc: NoteDocument): NoteDocument {
  return restat(toMyOriginal(doc));
}

/* -------------------------------------------------------------------------- *
 * The pieces
 * -------------------------------------------------------------------------- */

function accepted(block: Block): Block {
  if (block.origin === 'student') return block;
  const next = { ...block, origin: 'student' as const };
  delete next.originalText;
  return next;
}

function restore(block: Block, onPage: Set<string>): Block[] {
  if (block.origin === 'student') return [block];
  if (block.origin === 'ai-added') return [];

  const original = block.originalText?.trim();
  if (!original || onPage.has(original)) return [];
  return [
    {
      type: 'paragraph',
      text: original,
      origin: 'student',
      ...(block.id ? { id: block.id } : {}),
    } satisfies ParagraphBlock,
  ];
}

/** The student's own prose already on the page, so a restore cannot print a line twice. */
function studentLines(doc: NoteDocument): Set<string> {
  const lines = new Set<string>();
  for (const section of doc.sections) {
    for (const block of section.blocks) {
      if (block.origin === 'student' && block.type === 'paragraph') lines.add(block.text.trim());
    }
  }
  return lines;
}

/**
 * Drops the correction that described this block's change.
 *
 * Matched on the student's own wording, which is the field both sides agree on: `Correction.original`
 * and `Provenanced.originalText` are the same sentence by construction (04 §5 requires every
 * correction to have a matching inline `ai-corrected` mark). Falling back to the corrected text
 * catches the case where the verify pass rewrote the block after the correction was recorded.
 */
function withoutCorrectionFor(corrections: Correction[], block: Block): Correction[] {
  const original = block.originalText?.trim();
  if (!original) return corrections;
  return corrections.filter((correction) => correction.original.trim() !== original);
}

function mapBlocks(doc: NoteDocument, fn: (block: Block) => Block[]): NoteDocument {
  return {
    ...doc,
    sections: doc.sections.map((section) => ({
      ...section,
      blocks: section.blocks.flatMap(fn),
    })),
  };
}

/** Every mutation here changes the added/corrected counts the outline and the panels read. */
function restat(doc: NoteDocument): NoteDocument {
  return { ...doc, stats: computeStats(doc) };
}
