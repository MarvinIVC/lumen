/**
 * The ProseMirror schema the editor speaks (phase-05 §8).
 *
 * The mapping problem stated plainly: a `NoteDocument` has twelve block types, and ProseMirror
 * will happily discard anything its schema cannot describe. Editing a note through a schema that
 * only knows about paragraphs and lists would silently delete every formula, diagram, table and
 * worked example the moment the student typed a character — and it would look like it worked.
 *
 * So the split is by what a student can usefully edit *as text*:
 *
 *   paragraph, list       real ProseMirror nodes. Prose is prose; you type in it.
 *   the other ten types   `noteBlock`, a single atom node carrying the whole typed block in an
 *                         attribute. The cursor treats it as one object, the node view renders it
 *                         with the phase-01 read renderer, and a click opens a focused editor for
 *                         the two or three fields that block actually has.
 *
 * The atom is what makes "zero data loss" structural rather than aspirational. A `workedExample`
 * has a problem, numbered steps with optional LaTeX, an answer, a common mistake and possibly the
 * student's original attempt; expressing that as nested ProseMirror nodes would be a week of work
 * and a permanent source of round-trip bugs, to give a student a worse editor than three labelled
 * fields. The interesting round-trip risk is therefore concentrated in `paragraph` and `list`,
 * which is where `round-trip.test.ts` spends its effort.
 *
 * Nothing here imports React. The schema has to be constructible in Node — the property test does
 * exactly that, through `getSchema`, so it exercises ProseMirror's real normalisation rather than
 * our idea of it. Node views live in `node-views.tsx` and are attached by the editor component.
 */
import { Extension, Mark, Node, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

/** Provenance, carried on every node that maps to a block. */
const provenanceAttributes = {
  blockId: { default: null as string | null },
  origin: { default: 'student' as string },
  originalText: { default: null as string | null },
};

/**
 * A section of the document.
 *
 * A real node rather than a heading followed by loose blocks, because a section is the unit
 * everything else addresses: `sectionId` is what the outline, the flashcards, the quiz, the
 * corrections and "regenerate this" all point at. Modelling it as a heading would mean inferring
 * section membership from document order on every keystroke, and would let a student delete a
 * heading and silently merge two sections that half the document still references separately.
 */
export const SectionNode = Node.create({
  name: 'section',
  group: 'sectionGroup',
  // A heading, then the blocks. Required rather than optional, and that is the point: a section
  // whose heading could be deleted is a section a student can silently merge into its neighbour,
  // while half the document — the outline, the flashcards, the corrections — still references it
  // by an id that now names a heading that is not there.
  content: 'sectionHeading block+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      sectionId: { default: '' },
      level: { default: 2 },
    };
  },

  parseHTML() {
    return [{ tag: 'section[data-section-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['section', mergeAttributes(HTMLAttributes), 0];
  },
});

/**
 * The section's own heading, as editable text.
 *
 * `section.title` was an attribute in the first cut of this schema, which rendered an editor with
 * no headings in it at all: a wall of paragraphs, formulas and tables with nothing to say where one
 * part of the lesson ended and the next began, and no way to fix a heading the model got wrong. It
 * is a node so that it is *there* and so that it is editable, which for a heading is the same
 * requirement twice.
 *
 * `text*` rather than `inline*`: a heading is a string in `NoteDocument` and cannot carry a mark
 * that would survive the trip back.
 */
export const SectionHeadingNode = Node.create({
  name: 'sectionHeading',
  content: 'text*',
  marks: '',
  defining: true,

  addAttributes() {
    return { level: { default: 2 } };
  },

  parseHTML() {
    return [{ tag: 'h2[data-section-heading]' }, { tag: 'h3[data-section-heading]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      node.attrs.level === 3 ? 'h3' : 'h2',
      mergeAttributes(HTMLAttributes, { 'data-section-heading': '' }),
      0,
    ];
  },
});

/**
 * Every block type that is not prose, as one atom.
 *
 * `payload` is the block minus its id — the typed object, unmodified. Keeping it whole rather than
 * spreading it across attributes is deliberate: the schema then does not need to change when a
 * block type gains a field, and there is exactly one thing to get right on the way back out.
 */
export const NoteBlockNode = Node.create({
  name: 'noteBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      ...provenanceAttributes,
      /** The block's `type`, mirrored out of the payload so CSS and node views can branch on it. */
      blockType: { default: 'paragraph' },
      payload: { default: null as unknown },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-note-block]' }];
  },

  renderHTML({ HTMLAttributes }) {
    // Only ever hit by copy-to-clipboard and by `getHTML()`. The node view is what a student sees.
    return ['div', mergeAttributes(HTMLAttributes, { 'data-note-block': '' })];
  },
});

/**
 * Inline provenance (`InlineSpan`).
 *
 * Phase-04 measured that nothing emits these — not the model, not the gold fixture — and the
 * decision taken with the user for phase-05 is that block-level accept/reject is the product. The
 * mark exists anyway, for one reason that is not speculative: the schema has always allowed spans,
 * and an editor that dropped them would be a round-trip that loses data on the one document shape
 * we have not seen yet. It costs a mark definition to be correct instead.
 *
 * `seq` is the unlovely part and it is load-bearing. ProseMirror merges adjacent text nodes whose
 * marks compare equal, so two consecutive spans with the same origin would come back as one — a
 * silent, invisible edit to the student's provenance. A per-span ordinal makes the marks unequal
 * and the boundary survives.
 */
export const ProvenanceSpan = Mark.create({
  name: 'provenanceSpan',
  inclusive: false,

  addAttributes() {
    return {
      origin: { default: null as string | null },
      originalText: { default: null as string | null },
      seq: { default: 0 },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-origin]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },
});

/** Adds the provenance attributes to the two node types that map to prose blocks. */
export const BlockProvenance = Extension.create({
  name: 'blockProvenance',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'bulletList', 'orderedList'],
        attributes: provenanceAttributes,
      },
    ];
  },
});

/**
 * The extension list, in one place so the editor and the property test cannot drift.
 *
 * StarterKit gives the prose vocabulary; almost all of the rest of it is turned off. Not out of
 * minimalism — a blockquote or a horizontal rule has no representation in `NoteDocument`, so
 * offering one would let a student create content that cannot be saved. Headings are off for the
 * same reason: `section.title` is the only heading a note has, and it is edited as a field.
 */
export function noteEditorExtensions() {
  return [
    StarterKit.configure({
      document: false,
      heading: false,
      blockquote: false,
      horizontalRule: false,
      codeBlock: false,
      strike: false,
      // `hardBreak` would put a `\n` inside a paragraph's text, which survives the round trip but
      // renders as a space in the read view — an edit that appears to do nothing.
      hardBreak: false,
      link: false,
      underline: false,
    }),
    NoteDocumentNode,
    SectionNode,
    SectionHeadingNode,
    NoteBlockNode,
    ProvenanceSpan,
    BlockProvenance,
  ];
}

/** The top node: a document is its sections, and nothing else may live at the top level. */
export const NoteDocumentNode = Node.create({
  name: 'doc',
  topNode: true,
  content: 'sectionGroup+',
});
