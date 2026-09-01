/**
 * ProseMirror JSON → `NoteDocument` (phase-05 §8). The other half of `from-doc.ts`.
 *
 * Everything crossing this boundary is `unknown`: ProseMirror's JSON is not typed, a node view can
 * put anything in an attribute, and a document restored from IndexedDB was written by an older
 * build. So this reads defensively and never throws — a malformed node is dropped, not a crash in
 * the middle of an autosave. The one thing it must never do is invent: a block it cannot read is a
 * block that goes, and `round-trip.test.ts` is what proves that path is unreachable for anything
 * we actually produce.
 *
 * The document's non-section parts — corrections, open questions, the glossary, study tools — are
 * not in the editor at all and are carried over from the document being edited. They are not
 * editable prose; they are derived records about it, and the panels that show them are read-only.
 */
import type { Block, ListBlock, NoteDocument, ParagraphBlock, Section } from '@/lib/ai/schema';
import type { InlineSpan, Origin } from '@/lib/ai/schema';

import type { PmNode } from './from-doc';

const ORIGINS = new Set<Origin>(['student', 'ai-clarified', 'ai-added', 'ai-corrected']);

/** Merges the edited sections back into the document they came from. */
export function tipTapToDoc(base: NoteDocument, node: unknown): NoteDocument {
  const sections = asNode(node)
    ?.content?.map(sectionFromTipTap)
    .filter((section): section is Section => section !== null);

  // A read that produced nothing is a read that failed, and replacing a student's sections with an
  // empty array on the way to an autosave would be the worst bug in the product. Keep what we had.
  if (!sections?.length) return base;

  return { ...base, sections };
}

export function sectionFromTipTap(node: unknown): Section | null {
  const section = asNode(node);
  if (!section || section.type !== 'section') return null;

  const attrs = section.attrs ?? {};
  const children = section.content ?? [];
  // The heading is a node rather than an attribute, so the student can fix a title the model got
  // wrong. It is always the first child; the schema requires it.
  const heading = children.find((child) => child.type === 'sectionHeading');
  const blocks = children
    .filter((child) => child.type !== 'sectionHeading')
    .map(blockFromTipTap)
    .filter((block): block is Block => block !== null);

  return {
    id: str(attrs.sectionId),
    title: heading ? textOf(heading) : '',
    level: attrs.level === 3 ? 3 : 2,
    blocks,
  };
}

export function blockFromTipTap(node: unknown): Block | null {
  const pm = asNode(node);
  if (!pm) return null;

  switch (pm.type) {
    case 'paragraph':
      return paragraphFromTipTap(pm);
    case 'bulletList':
    case 'orderedList':
      return listFromTipTap(pm);
    case 'noteBlock':
      return noteBlockFromTipTap(pm);
    default:
      return null;
  }
}

/* -------------------------------------------------------------------------- *
 * Per type
 * -------------------------------------------------------------------------- */

function paragraphFromTipTap(pm: PmNode): ParagraphBlock {
  const spans = spansOf(pm);
  const block: ParagraphBlock = {
    type: 'paragraph',
    text: textOf(pm),
    ...provenanceOf(pm),
  };
  if (spans) block.spans = spans;
  return block;
}

/**
 * Reconstructs inline spans, or returns null when the paragraph is plain text.
 *
 * "Plain" is decided by the marks, not by the text: a paragraph the student typed into has one
 * unmarked text node and must come back as `text` with no `spans`, or every edited paragraph would
 * grow a spans array it never had.
 */
function spansOf(pm: PmNode): InlineSpan[] | null {
  const children = pm.content ?? [];
  if (!children.some((child) => child.marks?.some((mark) => mark.type === 'provenanceSpan'))) {
    return null;
  }

  return children
    .filter((child) => child.type === 'text' && typeof child.text === 'string')
    .map((child) => {
      const mark = child.marks?.find((candidate) => candidate.type === 'provenanceSpan');
      const origin = mark?.attrs?.origin;
      const originalText = mark?.attrs?.originalText;
      const span: InlineSpan = { text: child.text ?? '' };
      if (typeof origin === 'string' && ORIGINS.has(origin as Origin))
        span.origin = origin as Origin;
      if (typeof originalText === 'string') span.originalText = originalText;
      return span;
    });
}

function listFromTipTap(pm: PmNode): ListBlock {
  return {
    type: 'list',
    ordered: pm.type === 'orderedList',
    items: (pm.content ?? [])
      .filter((item) => item.type === 'listItem')
      .map((item) => (item.content ?? []).map(textOf).join('\n')),
    ...provenanceOf(pm),
  };
}

/**
 * Unwraps an atom back to the block it was carrying.
 *
 * Provenance comes from the node attributes rather than from the payload, because accept/reject
 * writes it there — that is the whole point of mirroring it out. The payload's own `origin` is
 * whatever it was when the block entered the editor and is deliberately overwritten.
 */
function noteBlockFromTipTap(pm: PmNode): Block | null {
  const payload = pm.attrs?.payload;
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;

  const provenance = provenanceOf(pm);
  const block = { ...(payload as Record<string, unknown>), ...provenance } as Block;
  // `originalText` is absent rather than undefined when there is none — the round trip compares
  // documents with `toEqual`, and an explicit `undefined` is not the same object as a missing key.
  if (provenance.originalText === undefined)
    delete (block as { originalText?: string }).originalText;
  return typeof block.type === 'string' ? block : null;
}

/* -------------------------------------------------------------------------- *
 * Readers
 * -------------------------------------------------------------------------- */

function provenanceOf(pm: PmNode): { origin: Origin; originalText?: string; id?: string } {
  const attrs = pm.attrs ?? {};
  const origin = str(attrs.origin);
  const originalText = attrs.originalText;
  const blockId = attrs.blockId;

  return {
    origin: ORIGINS.has(origin as Origin) ? (origin as Origin) : 'student',
    ...(typeof originalText === 'string' ? { originalText } : {}),
    ...(typeof blockId === 'string' && blockId ? { id: blockId } : {}),
  };
}

/** All the text under a node, in order. */
function textOf(node: PmNode): string {
  if (node.type === 'text') return node.text ?? '';
  return (node.content ?? []).map(textOf).join('');
}

function asNode(value: unknown): PmNode | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const node = value as PmNode;
  return typeof node.type === 'string' ? node : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
