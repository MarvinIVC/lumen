/**
 * The document operations behind regenerate, insert and version history (phase-05 §10–§13).
 *
 * All pure, all `NoteDocument → NoteDocument`, and all with a bookkeeping obligation that is easy
 * to forget and invisible when forgotten: a replaced section leaves behind corrections about text
 * that is gone, an inserted block arrives with no id, a restore hands back a document written by an
 * older schema. Those are the cases below.
 */
import { describe, expect, it } from 'vitest';

import { assignBlockIds, validateSectionFragment } from '@/lib/ai/validate';
import { diffSection } from '@/lib/notes/diff';
import { insertBlock, removeBlock, replaceSection, updateBlock } from '@/lib/notes/patch';
import { newBlockId } from '@/lib/notes/identity';
import { prunable } from '@/lib/store/versions';
import type { Block, NoteDocument, Section } from '@/lib/ai/schema';
import type { NoteVersion } from '@/lib/store/types';

function para(text: string, origin: Block['origin'] = 'student'): Block {
  return { type: 'paragraph', text, origin };
}

function docOf(sections: Section[], extra: Partial<NoteDocument> = {}): NoteDocument {
  return assignBlockIds({
    schemaVersion: '1.1.0',
    promptVersion: '1.3.0',
    title: 'Doc',
    context: {
      subject: 'Chemistry',
      curriculum: 'AP',
      course: 'AP Chemistry',
      unit: null,
      topic: null,
      language: 'en',
    },
    options: { mode: 'complete', depth: 'match', visuals: 'auto', voice: 'keep-mine' },
    summary: 'Summary.',
    objectives: [],
    sections,
    corrections: [],
    openQuestions: [],
    factCheck: { calculationsVerified: [], checkedClaims: 0, flags: [] },
    studyTools: { flashcards: [], quiz: [] },
    glossary: [],
    ...extra,
  });
}

const TWO_SECTIONS: Section[] = [
  { id: 's-1', title: 'One', level: 2, blocks: [para('first'), para('second')] },
  { id: 's-2', title: 'Two', level: 2, blocks: [para('third')] },
];

describe('replaceSection', () => {
  const doc = docOf(TWO_SECTIONS, {
    corrections: [
      { sectionId: 's-1', original: 'a', corrected: 'b', why: 'c' },
      { sectionId: 's-2', original: 'd', corrected: 'e', why: 'f' },
    ],
    openQuestions: [{ sectionId: 's-1', question: 'q', why: 'w' }],
    factCheck: {
      calculationsVerified: [],
      checkedClaims: 1,
      flags: [{ sectionId: 's-1', claim: 'x', issue: 'y', confidence: 'low' }],
    },
  });

  const incoming: Section = {
    id: 'whatever-the-model-called-it',
    title: 'One, rewritten',
    level: 3,
    blocks: [para('rewritten', 'ai-added')],
  };

  it('swaps the blocks', () => {
    const next = replaceSection(doc, 's-1', incoming);
    expect(next.sections[0]?.blocks.map((block) => (block as { text: string }).text)).toEqual([
      'rewritten',
    ]);
  });

  /**
   * Every `sectionId` in the document points at this string — the flashcards, the quiz, the
   * corrections, the outline. A regeneration that renamed it would strand all of them at once.
   */
  it('keeps the id and the level it had, whatever the model returned', () => {
    const next = replaceSection(doc, 's-1', incoming);
    expect(next.sections[0]?.id).toBe('s-1');
    expect(next.sections[0]?.level).toBe(2);
  });

  it('takes the new title', () => {
    expect(replaceSection(doc, 's-1', incoming).sections[0]?.title).toBe('One, rewritten');
  });

  it('drops annotations about the text it replaced, and only those', () => {
    const next = replaceSection(doc, 's-1', incoming);
    expect(next.corrections.map((entry) => entry.sectionId)).toEqual(['s-2']);
    expect(next.openQuestions).toEqual([]);
    expect(next.factCheck.flags).toEqual([]);
  });

  it('takes the annotations that came back with the fragment', () => {
    const next = replaceSection(doc, 's-1', incoming, {
      corrections: [{ sectionId: 'ignored', original: 'new', corrected: 'fix', why: 'because' }],
    });
    expect(next.corrections).toContainEqual({
      sectionId: 's-1',
      original: 'new',
      corrected: 'fix',
      why: 'because',
    });
  });

  it('gives the new blocks ids that do not collide with the rest of the document', () => {
    const next = replaceSection(doc, 's-1', {
      ...incoming,
      // The fragment claims an id another section is already using.
      blocks: [{ ...para('rewritten'), id: 's-2-b0' }],
    });
    const ids = next.sections.flatMap((section) => section.blocks.map((block) => block.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(Boolean)).toBe(true);
  });

  it('leaves the document alone when the section is not there', () => {
    expect(replaceSection(doc, 'nope', incoming)).toBe(doc);
  });
});

describe('insert, update, remove', () => {
  const doc = docOf(TWO_SECTIONS);

  it('inserts after a named block', () => {
    const after = doc.sections[0]!.blocks[0]!.id!;
    const next = insertBlock(doc, 's-1', para('inserted'), after);
    expect(next.sections[0]?.blocks.map((block) => (block as { text: string }).text)).toEqual([
      'first',
      'inserted',
      'second',
    ]);
  });

  it('inserts at the end when no anchor is given', () => {
    const next = insertBlock(doc, 's-1', para('inserted'));
    expect(next.sections[0]?.blocks.at(-1)).toMatchObject({ text: 'inserted' });
  });

  it('gives the inserted block an id', () => {
    const next = insertBlock(doc, 's-1', para('inserted'));
    expect(next.sections[0]?.blocks.at(-1)?.id).toBeTruthy();
  });

  it('mints an id that is free', () => {
    const taken = new Set(doc.sections.flatMap((s) => s.blocks.map((b) => b.id)));
    expect(taken.has(newBlockId(doc, 's-1'))).toBe(false);
  });

  it('keeps the block id when a block is edited in place', () => {
    const id = doc.sections[0]!.blocks[0]!.id!;
    const next = updateBlock(doc, id, para('changed'));
    expect(next.sections[0]?.blocks[0]).toMatchObject({ id, text: 'changed' });
  });

  it('removes by id', () => {
    const id = doc.sections[0]!.blocks[0]!.id!;
    expect(removeBlock(doc, id).sections[0]?.blocks).toHaveLength(1);
  });

  it('recomputes the stats after each of them', () => {
    const next = insertBlock(doc, 's-1', para('added', 'ai-added'));
    expect(next.stats?.aiAdded).toBe(1);
  });
});

describe('the regenerate diff', () => {
  const before: Section = {
    id: 's-1',
    title: 'One',
    level: 2,
    blocks: [para('keep me'), para('drop me'), para('keep me too')],
  };

  it('matches surviving blocks by content, not by id', () => {
    const after: Section = {
      ...before,
      // Same text, ids the model never saw.
      blocks: [para('keep me'), para('brand new'), para('keep me too')],
    };
    const diff = diffSection(before, after);
    expect(diff.kept).toBe(2);
    expect(diff.added).toBe(1);
    expect(diff.removed).toBe(1);
  });

  it('reports an unchanged rewrite as unchanged, so the apply button can refuse it', () => {
    expect(diffSection(before, { ...before }).identical).toBe(true);
  });

  it('reads a whole new section as all-new', () => {
    const diff = diffSection(before, { ...before, blocks: [para('nothing alike')] });
    expect(diff.kept).toBe(0);
    expect(diff.removed).toBe(3);
    expect(diff.added).toBe(1);
  });

  it('does not confuse two block types that carry the same words', () => {
    const diff = diffSection(
      { ...before, blocks: [para('same words')] },
      {
        ...before,
        blocks: [{ type: 'callout', kind: 'tip', text: 'same words', origin: 'ai-added' }],
      },
    );
    expect(diff.identical).toBe(false);
  });
});

describe('validateSectionFragment', () => {
  const good = {
    section: {
      id: 's-1',
      title: 'Moles',
      level: 2,
      blocks: [{ type: 'paragraph', text: 'A mole is an amount.', origin: 'ai-added' }],
    },
  };

  it('accepts a fragment the whole-document validator could not be asked about', () => {
    const result = validateSectionFragment(good);
    expect(result.ok).toBe(true);
    expect(result.section?.blocks).toHaveLength(1);
  });

  it('tolerates a section returned without its envelope', () => {
    expect(validateSectionFragment(good.section).ok).toBe(true);
  });

  it('applies the same block rules a generation gets', () => {
    const result = validateSectionFragment({
      section: {
        ...good.section,
        // A formula with no units is the rule 04 §5 is most specific about.
        blocks: [{ type: 'formula', latex: 'c = n/V', where: [], useWhen: '', origin: 'ai-added' }],
      },
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.rule === 'formula-units')).toBe(true);
  });

  it('fails rather than returning an empty section', () => {
    expect(validateSectionFragment({ section: { ...good.section, blocks: [] } }).ok).toBe(false);
  });

  it('fails on something that is not a section at all', () => {
    expect(validateSectionFragment('nope').ok).toBe(false);
    expect(validateSectionFragment({ hello: 'world' }).ok).toBe(false);
  });

  it('picks up the annotations that came with it', () => {
    const result = validateSectionFragment({
      ...good,
      corrections: [{ original: 'a', corrected: 'b', why: 'c' }],
      glossary: [{ term: 'mole', definition: 'an amount' }],
      openQuestions: [{ question: 'q', why: 'w' }],
    });
    expect(result.corrections).toHaveLength(1);
    expect(result.glossary).toHaveLength(1);
    expect(result.openQuestions).toHaveLength(1);
  });

  it('drops annotation entries with nothing in them', () => {
    const result = validateSectionFragment({ ...good, corrections: [{ why: 'no original' }] });
    expect(result.corrections).toEqual([]);
  });
});

describe('version pruning', () => {
  const version = (id: string, reason: NoteVersion['reason'], createdAt: number): NoteVersion =>
    ({ id, noteId: 'n', createdAt, reason, label: reason, doc: {} }) as unknown as NoteVersion;

  it('never prunes a generation snapshot, however old', () => {
    const versions = [
      version('gen', 'generated', 0),
      ...Array.from({ length: 40 }, (_, index) => version(`e${index}`, 'edit', index + 1)),
    ];
    expect(prunable(versions).map((entry) => entry.id)).not.toContain('gen');
  });

  it('keeps the most recent edit snapshots and drops the rest', () => {
    const versions = Array.from({ length: 25 }, (_, index) =>
      version(`e${index}`, 'edit', index + 1),
    );
    const dropped = prunable(versions);
    expect(dropped).toHaveLength(5);
    // The five oldest.
    expect(dropped.map((entry) => entry.id).sort()).toEqual(['e0', 'e1', 'e2', 'e3', 'e4']);
  });

  it('prunes nothing while there is room', () => {
    expect(prunable([version('e0', 'edit', 1)])).toEqual([]);
  });
});
