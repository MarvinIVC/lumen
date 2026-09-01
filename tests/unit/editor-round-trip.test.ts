/**
 * doc → TipTap → doc is the identity (phase-05 definition of done).
 *
 * The single most important test in the phase. Everything else about the editor can be wrong and
 * a student loses a formatting choice; if this is wrong they open their study guide, type one
 * character, and their diagrams are gone — with no error, no warning, and an autosave that
 * cheerfully persists the loss.
 *
 * It runs the real ProseMirror schema, not our own JSON. `Schema.nodeFromJSON(…).toJSON()` is what
 * applies the normalisation that actually loses data: adjacent text nodes with equal marks merge,
 * illegal content is dropped to fit the content expression, missing attributes take their
 * defaults. Comparing our two functions to each other without that step would test that they
 * agree, which they would, right up until ProseMirror disagreed with both.
 */
import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';

import { noteEditorExtensions } from '@/lib/editor/extensions';
import { docToTipTap } from '@/lib/editor/from-doc';
import { tipTapToDoc } from '@/lib/editor/to-doc';
import { goldFixture } from '@/lib/render/fixture/gold';
import { assignBlockIds } from '@/lib/ai/validate';
import {
  sampleCallouts,
  sampleDefinition,
  sampleFormula,
  sampleMarginNotes,
  sampleMermaid,
  sampleMisconception,
  sampleStructure,
  sampleTable,
  sampleWorkedExample,
} from '@/lib/render/fixture/samples';
import type { Block, NoteDocument } from '@/lib/ai/schema';

const schema = getSchema(noteEditorExtensions());

/** The trip a real edit makes: our serialiser, ProseMirror's own parse, our reader. */
function roundTrip(doc: NoteDocument): NoteDocument {
  const normalised = schema.nodeFromJSON(docToTipTap(doc)).toJSON();
  return tipTapToDoc(doc, normalised);
}

function documentOf(blocks: Block[]): NoteDocument {
  return assignBlockIds({
    schemaVersion: '1.1.0',
    promptVersion: '1.3.0',
    title: 'Round trip',
    context: {
      subject: 'Chemistry',
      curriculum: 'AP',
      course: 'AP Chemistry',
      unit: 'Unit 1',
      topic: null,
      language: 'en',
    },
    options: { mode: 'complete', depth: 'match', visuals: 'auto', voice: 'keep-mine' },
    summary: 'A document that exists to be serialised.',
    objectives: [],
    sections: [{ id: 's-1', title: 'Everything', level: 2, blocks }],
    corrections: [],
    openQuestions: [],
    factCheck: { calculationsVerified: [], checkedClaims: 0, flags: [] },
    studyTools: { flashcards: [], quiz: [] },
    glossary: [],
  });
}

/**
 * One of every block type.
 *
 * Assembled from the story samples rather than written again here, so a block type that gains a
 * field gains it in one place and this test starts covering it without being touched.
 */
const EVERY_BLOCK: Block[] = [
  { type: 'paragraph', text: 'Plain prose with inline $\\ce{CO2}$ in it.', origin: 'student' },
  { type: 'list', ordered: false, items: ['first', 'second'], origin: 'ai-added' },
  { type: 'list', ordered: true, items: ['step one', 'step two'], origin: 'student' },
  sampleDefinition,
  sampleFormula,
  sampleWorkedExample,
  sampleMermaid,
  // A chart diagram as well as a Mermaid one: they are the same block type carrying entirely
  // different payloads, and only one of them is in the samples.
  {
    type: 'diagram',
    engine: 'chart',
    spec: {
      kind: 'bars',
      illustrative: false,
      x: 'Mass / charge',
      y: 'Relative abundance / %',
      series: [
        { label: '35', value: 75.8 },
        { label: '37', value: 24.2 },
      ],
    },
    caption: 'Mass spectrum of chlorine.',
    alt: 'Two peaks at m/z 35 and 37.',
    origin: 'ai-added',
  },
  sampleStructure,
  ...sampleCallouts,
  sampleMisconception,
  sampleTable,
  ...sampleMarginNotes,
  {
    type: 'figure',
    assetId: 'a-1',
    caption: 'A photo of the board.',
    alt: 'Whiteboard',
    origin: 'student',
  },
];

describe('doc ⇄ TipTap', () => {
  it('round-trips every block type without losing a field', () => {
    const doc = documentOf(EVERY_BLOCK);
    expect(roundTrip(doc).sections).toEqual(doc.sections);
  });

  it.each(EVERY_BLOCK.map((block) => [block.type, block] as const))(
    'round-trips a %s on its own',
    (_type, block) => {
      const doc = documentOf([block]);
      expect(roundTrip(doc).sections[0]?.blocks).toEqual(doc.sections[0]?.blocks);
    },
  );

  it('round-trips the AP Chem gold fixture', () => {
    const doc = assignBlockIds(goldFixture());
    expect(roundTrip(doc).sections).toEqual(doc.sections);
  });

  it('is idempotent — a second trip changes nothing', () => {
    const doc = documentOf(EVERY_BLOCK);
    expect(roundTrip(roundTrip(doc)).sections).toEqual(doc.sections);
  });

  /**
   * The case ProseMirror would silently break.
   *
   * Two adjacent spans with the same origin are two spans. Without the ordinal on the mark they
   * come back as one, the paragraph still reads correctly, and the student's provenance has been
   * quietly rewritten — which is exactly the class of bug the whole provenance system exists to
   * make impossible.
   */
  it('keeps adjacent inline spans apart', () => {
    const doc = documentOf([
      {
        type: 'paragraph',
        text: 'one two three',
        origin: 'student',
        spans: [
          { text: 'one ', origin: 'student' },
          { text: 'two ', origin: 'student' },
          { text: 'three', origin: 'ai-clarified', originalText: 'thre' },
        ],
      },
    ]);
    const back = roundTrip(doc).sections[0]?.blocks[0];
    expect(back).toEqual(doc.sections[0]?.blocks[0]);
    expect(back && 'spans' in back && back.spans).toHaveLength(3);
  });

  it('does not invent spans on a plain paragraph', () => {
    const doc = documentOf([{ type: 'paragraph', text: 'Just prose.', origin: 'student' }]);
    const back = roundTrip(doc).sections[0]?.blocks[0];
    expect(back).not.toHaveProperty('spans');
  });

  it('survives an empty paragraph and an empty list item', () => {
    const doc = documentOf([
      { type: 'paragraph', text: '', origin: 'student' },
      { type: 'list', ordered: false, items: ['', 'after the gap'], origin: 'student' },
    ]);
    expect(roundTrip(doc).sections[0]?.blocks).toEqual(doc.sections[0]?.blocks);
  });

  /**
   * "Keep only mine" on an entirely AI-written note produces a document with no sections, and
   * `doc: 'sectionGroup+'` has no empty form — there is no such thing as an empty ProseMirror
   * document under this schema.
   *
   * So the trip is deliberately *not* the identity here, and this is the one case where that is
   * right: the student gets one empty section with a cursor in it. The alternative is a schema
   * error thrown from the editor's constructor on a note they still own, which would look exactly
   * like having lost it.
   */
  it('gives an emptied document one blank section to type into', () => {
    const doc = { ...documentOf([]), sections: [] };
    expect(() => roundTrip(doc)).not.toThrow();

    const sections = roundTrip(doc).sections;
    expect(sections).toHaveLength(1);
    expect(sections[0]?.blocks).toEqual([{ type: 'paragraph', text: '', origin: 'student' }]);
  });

  /**
   * The heading is a node, not an attribute, so a student can fix a title the model got wrong.
   * That makes it a round-trip surface like any other text.
   */
  it('round-trips section titles and levels', () => {
    const doc = documentOf(EVERY_BLOCK);
    const withLevels: NoteDocument = {
      ...doc,
      sections: [
        { ...doc.sections[0]!, title: '1.2 Isotopes & mass spectrometry', level: 3 },
        {
          id: 's-2',
          title: '',
          level: 2,
          blocks: [{ type: 'paragraph', text: 'x', origin: 'student' }],
        },
      ],
    };
    expect(roundTrip(withLevels).sections).toEqual(withLevels.sections);
  });

  it('keeps the non-section parts of the document untouched', () => {
    const doc = documentOf(EVERY_BLOCK);
    const back = roundTrip({
      ...doc,
      corrections: [{ sectionId: 's-1', original: 'a', corrected: 'b', why: 'c' }],
      glossary: [{ term: 'mole', definition: 'a lot of things', sectionId: 's-1' }],
    });
    expect(back.corrections).toHaveLength(1);
    expect(back.glossary).toHaveLength(1);
  });
});
