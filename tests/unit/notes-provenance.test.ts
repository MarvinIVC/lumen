/**
 * Accept, reject, and "My original" (phase-05 §2, §9).
 *
 * These are the functions that decide what a student is looking at when they ask "what did you
 * change?" and "give me mine back". Two of the cases below are not hypotheses: they are shapes
 * phase-04 measured in the deployed AP Chem output, and both of them made the old one-line filter
 * lose the student's own work.
 */
import { describe, expect, it } from 'vitest';

import {
  acceptAll,
  acceptBlock,
  keepOnlyMine,
  pendingAiBlocks,
  rejectBlock,
} from '@/lib/notes/provenance';
import { hasOriginalContent, toMyOriginal } from '@/lib/notes/reading';
import { assignBlockIds } from '@/lib/ai/validate';
import type { Block, NoteDocument } from '@/lib/ai/schema';

function docOf(blocks: Block[], extra: Partial<NoteDocument> = {}): NoteDocument {
  return assignBlockIds({
    schemaVersion: '1.1.0',
    promptVersion: '1.3.0',
    title: 'Moles',
    context: {
      subject: 'Chemistry',
      curriculum: 'AP',
      course: 'AP Chemistry',
      unit: 'Unit 1',
      topic: null,
      language: 'en',
    },
    options: { mode: 'complete', depth: 'match', visuals: 'auto', voice: 'keep-mine' },
    summary: 'Something we wrote.',
    objectives: ['Something else we wrote.'],
    sections: [{ id: 's-1', title: 'Moles', level: 2, blocks }],
    corrections: [],
    openQuestions: [],
    factCheck: { calculationsVerified: [], checkedClaims: 0, flags: [] },
    studyTools: { flashcards: [], quiz: [] },
    glossary: [],
    ...extra,
  });
}

const mine: Block = { type: 'paragraph', text: 'A mole is 6.022e23 things.', origin: 'student' };
const added: Block = {
  type: 'paragraph',
  text: 'Avogadro constant, symbol N_A.',
  origin: 'ai-added',
};
const clarified: Block = {
  type: 'paragraph',
  text: 'Molar mass is the mass of one mole in grams.',
  origin: 'ai-clarified',
  originalText: 'molar mass = mass of 1 mole',
};

/**
 * The mercury calculation, as it actually came back: the student's arithmetic, fixed, with their
 * own line surviving *only* in `originalText`. No `student` block holds it.
 */
const corrected: Block = {
  type: 'formula',
  latex: 'n = \\dfrac{m}{M} = \\dfrac{100.30}{200.59} = 0.5000\\ \\text{mol}',
  where: [{ symbol: 'n', meaning: 'amount', units: 'mol' }],
  useWhen: 'Converting a mass to an amount.',
  origin: 'ai-corrected',
  originalText: 'n = 0.5 x 200.6 = 100.3 g',
};

describe('reading mode: my original', () => {
  it('gives back the student blocks unchanged', () => {
    const doc = docOf([mine, added]);
    const back = toMyOriginal(doc);
    expect(back.sections[0]?.blocks.map((block) => block.type)).toEqual(['paragraph']);
    expect(back.sections[0]?.blocks[0]).toMatchObject({ text: mine.text });
  });

  it('drops what we added', () => {
    const back = toMyOriginal(docOf([mine, added]));
    expect(JSON.stringify(back)).not.toContain('Avogadro');
  });

  /**
   * The bug this whole module exists for. Under the old rule the mercury calculation vanished from
   * the student's own view of their own notes, because the only copy of their wording is inside a
   * block whose origin is `ai-corrected`.
   */
  it("restores a corrected block to the student's own wording", () => {
    const back = toMyOriginal(docOf([mine, corrected]));
    const texts = back.sections[0]?.blocks.map((block) =>
      block.type === 'paragraph' ? block.text : '',
    );
    expect(texts).toContain('n = 0.5 x 200.6 = 100.3 g');
  });

  it('restores a clarified block to the phrasing we tightened', () => {
    const back = toMyOriginal(docOf([clarified]));
    expect(back.sections[0]?.blocks[0]).toMatchObject({
      text: 'molar mass = mass of 1 mole',
      origin: 'student',
    });
  });

  /** Measured in the deployed run: one sentence claimed by two blocks. */
  it('prints a shared original once, not twice', () => {
    const twin: Block = { ...clarified, type: 'paragraph', origin: 'ai-corrected' };
    const back = toMyOriginal(docOf([clarified, twin]));
    expect(back.sections[0]?.blocks).toHaveLength(1);
  });

  it('takes the summary, objectives and appendices with it', () => {
    const back = toMyOriginal(
      docOf([mine], {
        corrections: [{ sectionId: 's-1', original: 'a', corrected: 'b', why: 'c' }],
        glossary: [{ term: 'mole', definition: 'lots', sectionId: 's-1' }],
      }),
    );
    expect(back.summary).toBe('');
    expect(back.objectives).toEqual([]);
    expect(back.corrections).toEqual([]);
    expect(back.glossary).toEqual([]);
  });

  it('drops a section that had nothing of theirs in it', () => {
    expect(toMyOriginal(docOf([added])).sections).toEqual([]);
  });

  it('knows when there is nothing of theirs to show', () => {
    expect(hasOriginalContent(docOf([added]))).toBe(false);
    expect(hasOriginalContent(docOf([corrected]))).toBe(true);
  });
});

describe('accept', () => {
  it('freezes the block to the student', () => {
    const doc = docOf([added]);
    const id = doc.sections[0]!.blocks[0]!.id!;
    const block = acceptBlock(doc, id).sections[0]?.blocks[0];
    expect(block?.origin).toBe('student');
  });

  it('drops the original wording, because there is nothing left to go back to', () => {
    const doc = docOf([clarified]);
    const id = doc.sections[0]!.blocks[0]!.id!;
    expect(acceptBlock(doc, id).sections[0]?.blocks[0]).not.toHaveProperty('originalText');
  });

  it('accept all leaves nothing in the review queue', () => {
    const doc = docOf([mine, added, clarified, corrected]);
    expect(pendingAiBlocks(doc)).toHaveLength(3);
    expect(pendingAiBlocks(acceptAll(doc))).toHaveLength(0);
  });

  it('accept all keeps the corrections panel — it is a record, not a queue', () => {
    const doc = docOf([corrected], {
      corrections: [
        {
          sectionId: 's-1',
          original: 'n = 0.5 x 200.6 = 100.3 g',
          corrected: 'n = 0.5000 mol',
          why: 'You inverted it.',
        },
      ],
    });
    expect(acceptAll(doc).corrections).toHaveLength(1);
  });

  it('recomputes the counts the outline and the panels read', () => {
    const doc = docOf([added, corrected]);
    expect(acceptAll(doc).stats).toMatchObject({ aiAdded: 0, aiCorrected: 0 });
  });
});

describe('reject', () => {
  it('removes something we added', () => {
    const doc = docOf([mine, added]);
    const id = doc.sections[0]!.blocks[1]!.id!;
    expect(rejectBlock(doc, id).sections[0]?.blocks).toHaveLength(1);
  });

  it('restores a correction to the exact wording, character for character', () => {
    const doc = docOf([corrected]);
    const id = doc.sections[0]!.blocks[0]!.id!;
    const block = rejectBlock(doc, id).sections[0]?.blocks[0];
    expect(block).toMatchObject({
      type: 'paragraph',
      text: 'n = 0.5 x 200.6 = 100.3 g',
      origin: 'student',
    });
  });

  it('drops the correction card that described the change', () => {
    const doc = docOf([corrected], {
      corrections: [
        {
          sectionId: 's-1',
          original: 'n = 0.5 x 200.6 = 100.3 g',
          corrected: 'n = 0.5000 mol',
          why: 'You inverted it.',
        },
      ],
    });
    const id = doc.sections[0]!.blocks[0]!.id!;
    expect(rejectBlock(doc, id).corrections).toHaveLength(0);
  });

  /** Two blocks, one sentence: rejecting both must not print it twice. */
  it('does not duplicate a sentence two blocks both claim', () => {
    const twin: Block = { ...clarified, origin: 'ai-corrected' };
    const doc = docOf([clarified, twin]);
    const [first, second] = doc.sections[0]!.blocks;

    const once = rejectBlock(doc, first!.id!);
    expect(once.sections[0]?.blocks).toHaveLength(2);

    const twice = rejectBlock(once, second!.id!);
    const texts = twice.sections[0]!.blocks.map((block) =>
      block.type === 'paragraph' ? block.text : '',
    );
    expect(texts).toEqual(['molar mass = mass of 1 mole']);
  });

  it('leaves a block we cannot find alone', () => {
    const doc = docOf([mine]);
    expect(rejectBlock(doc, 'nope')).toEqual(doc);
  });
});

describe('keep only mine', () => {
  it('agrees with the reading mode it is the destructive twin of', () => {
    const doc = docOf([mine, added, clarified, corrected]);
    expect(keepOnlyMine(doc).sections).toEqual(toMyOriginal(doc).sections);
  });

  it('leaves an accepted block alone — accepting is what freezes it', () => {
    const doc = docOf([added]);
    const id = doc.sections[0]!.blocks[0]!.id!;
    const accepted = acceptBlock(doc, id);
    expect(keepOnlyMine(accepted).sections[0]?.blocks).toHaveLength(1);
  });
});
