/**
 * `NoteDocument` → ProseMirror JSON (phase-05 §8).
 *
 * One half of the round trip; `to-doc.ts` is the other, and `tests/unit/editor-round-trip.test.ts`
 * asserts the composition is the identity for every block type. Read them together — a change to
 * one that is not mirrored in the other is a data-loss bug that no type will catch, because both
 * sides are `unknown` at the ProseMirror boundary.
 *
 * Nothing here is lossy on purpose. Where a shape cannot be represented as prose it becomes a
 * `noteBlock` atom carrying the original object, which is the escape hatch that makes the
 * guarantee cheap to keep.
 */
import type { Block, ListBlock, NoteDocument, ParagraphBlock, Section } from '@/lib/ai/schema';

export interface PmNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PmNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

export function docToTipTap(doc: NoteDocument): PmNode {
  return {
    type: 'doc',
    // A ProseMirror document may not be empty, and `doc: 'sectionGroup+'` means an empty note has
    // no legal representation. It cannot happen from the pipeline — the validator rejects a
    // document with no sections — but it can happen from "keep only mine" on a note that was
    // entirely AI-written, and a schema error there would lose the student their document.
    content: doc.sections.length ? doc.sections.map(sectionToTipTap) : [emptySection()],
  };
}

function emptySection(): PmNode {
  return {
    type: 'section',
    attrs: { sectionId: 's-1', level: 2 },
    content: [
      { type: 'sectionHeading', attrs: { level: 2 } },
      {
        type: 'paragraph',
        attrs: provenanceAttrs({ type: 'paragraph', text: '', origin: 'student' }),
      },
    ],
  };
}

export function sectionToTipTap(section: Section): PmNode {
  const heading: PmNode = {
    type: 'sectionHeading',
    attrs: { level: section.level },
    // An empty heading has no text node: `text: ''` is not a legal ProseMirror text node.
    ...(section.title ? { content: [{ type: 'text', text: section.title }] } : {}),
  };

  return {
    type: 'section',
    attrs: { sectionId: section.id, level: section.level },
    // Same reason as above: `section: 'sectionHeading block+'` has no blockless form.
    content: [
      heading,
      ...(section.blocks.length
        ? section.blocks.map(blockToTipTap)
        : [
            {
              type: 'paragraph',
              attrs: provenanceAttrs({ type: 'paragraph', text: '', origin: 'student' }),
            },
          ]),
    ],
  };
}

function provenanceAttrs(block: Block): Record<string, unknown> {
  return {
    blockId: block.id ?? null,
    origin: block.origin,
    originalText: block.originalText ?? null,
  };
}

export function blockToTipTap(block: Block): PmNode {
  if (block.type === 'paragraph') return paragraphToTipTap(block);
  if (block.type === 'list') return listToTipTap(block);

  const { id: _id, ...payload } = block;
  return {
    type: 'noteBlock',
    attrs: {
      ...provenanceAttrs(block),
      blockType: block.type,
      payload,
    },
  };
}

function paragraphToTipTap(block: ParagraphBlock): PmNode {
  const attrs = provenanceAttrs(block);

  if (block.spans?.length) {
    return {
      type: 'paragraph',
      attrs,
      content: block.spans
        .filter((span) => span.text.length > 0)
        .map((span, index) => ({
          type: 'text',
          text: span.text,
          // The mark is written even for a span with no origin of its own, because its *absence*
          // is what would let ProseMirror merge it into its neighbour. See `ProvenanceSpan.seq`.
          marks: [
            {
              type: 'provenanceSpan',
              attrs: {
                origin: span.origin ?? null,
                originalText: span.originalText ?? null,
                seq: index,
              },
            },
          ],
        })),
    };
  }

  // An empty paragraph has no text node at all — `text: ''` is not a legal ProseMirror text node.
  return block.text
    ? { type: 'paragraph', attrs, content: [{ type: 'text', text: block.text }] }
    : { type: 'paragraph', attrs };
}

function listToTipTap(block: ListBlock): PmNode {
  return {
    type: block.ordered ? 'orderedList' : 'bulletList',
    attrs: provenanceAttrs(block),
    content: block.items.map((item) => ({
      type: 'listItem',
      content: [
        item
          ? { type: 'paragraph', content: [{ type: 'text', text: item }] }
          : { type: 'paragraph' },
      ],
    })),
  };
}
