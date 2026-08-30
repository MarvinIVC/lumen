import { describe, expect, it } from 'vitest';

import { computeStats, degradeDocument, validateNoteDocument } from '@/lib/ai/validate';
import type { NoteDocument } from '@/lib/ai/schema';

/**
 * The post-parse rules (04-AI-ENGINE.md §5) and the severity split they hang on.
 *
 *   'error'      the model can fix this if asked again, so it triggers the repair pass.
 *   'repairable' nothing to ask for; we fixed what could be fixed and the document is usable.
 *
 * The asymmetry these tests spend the most time on is deliberate and is a safety decision: a
 * dangling flashcard is dropped, a dangling fact-check flag is retargeted. Losing a flashcard
 * costs a student nothing; silently losing "double-check this claim" costs them the promise the
 * product is built on.
 */
function doc(overrides: Partial<NoteDocument> = {}): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify({
      title: 'Moles',
      summary: 'A lesson about counting particles.',
      objectives: ['Convert mass to moles'],
      sections: [
        {
          id: 's-1',
          title: '1.1 The mole',
          level: 2,
          blocks: [{ type: 'paragraph', origin: 'student', text: 'A mole is a count.' }],
        },
      ],
      corrections: [],
      openQuestions: [],
      factCheck: { calculationsVerified: [], checkedClaims: 0, flags: [] },
      studyTools: { flashcards: [], quiz: [] },
      glossary: [],
      ...overrides,
    }),
  ) as Record<string, unknown>;
}

const issue = (result: ReturnType<typeof validateNoteDocument>, rule: string) =>
  result.issues.find((entry) => entry.rule === rule);

describe('what fails outright', () => {
  it('rejects something that is not an object', () => {
    expect(validateNoteDocument('a study guide').ok).toBe(false);
  });

  it('rejects a document with no sections', () => {
    expect(validateNoteDocument(doc({ sections: [] })).ok).toBe(false);
  });

  it('accepts a small document that lost one block, because a share of four means nothing', () => {
    const oneBad = doc({
      sections: [
        {
          id: 's-1',
          title: 'One',
          level: 2,
          blocks: [
            { type: 'paragraph', origin: 'student', text: 'kept' },
            { type: 'nonsense', origin: 'student' },
          ],
        },
      ],
    } as unknown as Partial<NoteDocument>);
    expect(validateNoteDocument(oneBad).ok).toBe(true);
  });

  it('rejects a document whose blocks are nearly all unusable', () => {
    const broken = doc({
      sections: [
        {
          id: 's-1',
          title: 'One',
          level: 2,
          blocks: [
            { type: 'paragraph', origin: 'student', text: 'kept' },
            { type: 'paragraph', origin: 'student', text: 'also kept' },
            { type: 'nonsense', origin: 'student' },
            { type: 'nonsense', origin: 'student' },
            { type: 'nonsense', origin: 'student' },
            { type: 'nonsense', origin: 'student' },
          ],
        },
      ],
    } as unknown as Partial<NoteDocument>);
    expect(issue(validateNoteDocument(broken), 'too-much-dropped')).toBeTruthy();
  });
});

describe('formulas', () => {
  const withFormula = (where: unknown, useWhen = 'When you have a mass.') =>
    doc({
      sections: [
        {
          id: 's-1',
          title: 'One',
          level: 2,
          blocks: [
            { type: 'paragraph', origin: 'student', text: 'text' },
            { type: 'formula', origin: 'ai-added', latex: 'n = m/M', useWhen, where },
          ],
        },
      ],
    } as unknown as Partial<NoteDocument>);

  it('accepts one where every symbol has units', () => {
    const result = validateNoteDocument(
      withFormula([{ symbol: 'n', meaning: 'amount', units: 'mol' }]),
    );
    expect(result.ok).toBe(true);
  });

  it('fails one with no symbols at all', () => {
    const result = validateNoteDocument(withFormula([]));
    expect(issue(result, 'formula-units')?.severity).toBe('error');
  });

  it('fails one where a symbol has empty units', () => {
    const result = validateNoteDocument(
      withFormula([
        { symbol: 'n', meaning: 'amount', units: 'mol' },
        { symbol: 'm', meaning: 'mass', units: '' },
      ]),
    );
    expect(issue(result, 'formula-units')?.severity).toBe('error');
  });

  it('accepts dimensionless as a unit, because it is one', () => {
    const result = validateNoteDocument(
      withFormula([{ symbol: 'n', meaning: 'a ratio', units: 'dimensionless' }]),
    );
    expect(result.ok).toBe(true);
  });

  it('fails one with no "use this when"', () => {
    const result = validateNoteDocument(
      withFormula([{ symbol: 'n', meaning: 'amount', units: 'mol' }], ''),
    );
    expect(issue(result, 'formula-use-when')?.severity).toBe('error');
  });
});

describe('visuals', () => {
  const withBlock = (block: unknown) =>
    doc({
      sections: [
        {
          id: 's-1',
          title: 'One',
          level: 2,
          blocks: [{ type: 'paragraph', origin: 'student', text: 'text' }, block],
        },
      ],
    } as unknown as Partial<NoteDocument>);

  it('drops a diagram the renderer would refuse, and keeps the rest', () => {
    const result = validateNoteDocument(
      withBlock({
        type: 'diagram',
        origin: 'ai-added',
        engine: 'mermaid',
        source: 'erDiagram\n  A ||--o{ B : has',
        caption: 'A diagram',
        alt: 'A diagram',
      }),
    );
    expect(result.ok).toBe(true);
    expect(issue(result, 'mermaid')?.severity).toBe('repairable');
    expect(result.document?.sections[0]?.blocks).toHaveLength(1);
  });

  it('drops a structure whose SMILES will not parse', () => {
    const result = validateNoteDocument(
      withBlock({ type: 'structure', origin: 'ai-added', smiles: 'CC(', caption: 'c', alt: 'a' }),
    );
    expect(issue(result, 'smiles')?.severity).toBe('repairable');
    expect(result.document?.sections[0]?.blocks).toHaveLength(1);
  });

  it('uses the caption as alt text rather than dropping a good diagram', () => {
    const result = validateNoteDocument(
      withBlock({
        type: 'diagram',
        origin: 'ai-added',
        engine: 'mermaid',
        source: 'flowchart LR\n  a --> b',
        caption: 'How it flows',
        alt: '',
      }),
    );
    expect(result.document?.sections[0]?.blocks).toHaveLength(2);
    expect(issue(result, 'diagram-alt')?.severity).toBe('repairable');
  });

  it('assumes an unmarked chart is illustrative rather than measured', () => {
    const result = validateNoteDocument(
      withBlock({
        type: 'diagram',
        origin: 'ai-added',
        engine: 'chart',
        spec: { kind: 'bars', x: 'm/z', y: 'abundance', series: [{ label: '35', value: 75 }] },
        caption: 'A spectrum',
        alt: 'A spectrum',
      }),
    );
    const block = result.document?.sections[0]?.blocks[1];
    expect(block?.type === 'diagram' && block.spec?.illustrative).toBe(true);
  });

  it('fails a chart with no axis titles', () => {
    const result = validateNoteDocument(
      withBlock({
        type: 'diagram',
        origin: 'ai-added',
        engine: 'chart',
        spec: { kind: 'bars', illustrative: true, series: [{ label: 'a', value: 1 }] },
        caption: 'A chart',
        alt: 'A chart',
      }),
    );
    expect(issue(result, 'chart-axes')?.severity).toBe('error');
  });
});

describe('cross-references', () => {
  it('drops a flashcard pointing at a section that does not exist', () => {
    const result = validateNoteDocument(
      doc({
        studyTools: {
          flashcards: [
            { front: 'a', back: 'b', sectionId: 's-1' },
            { front: 'c', back: 'd', sectionId: 's-nope' },
          ],
          quiz: [],
        },
      } as unknown as Partial<NoteDocument>),
    );
    expect(result.document?.studyTools.flashcards).toHaveLength(1);
    expect(issue(result, 'dangling-section')?.severity).toBe('repairable');
  });

  it('retargets a fact-check flag rather than dropping it', () => {
    const result = validateNoteDocument(
      doc({
        factCheck: {
          calculationsVerified: [],
          checkedClaims: 1,
          flags: [
            {
              sectionId: 's-nope',
              claim: 'Something uncertain',
              issue: 'unsure',
              confidence: 'low',
            },
          ],
        },
      } as unknown as Partial<NoteDocument>),
    );
    expect(result.document?.factCheck.flags).toHaveLength(1);
    expect(result.document?.factCheck.flags[0]?.sectionId).toBe('s-1');
  });

  it('renames a duplicated section id instead of losing the section', () => {
    const result = validateNoteDocument(
      doc({
        sections: [
          {
            id: 's-1',
            title: 'One',
            level: 2,
            blocks: [{ type: 'paragraph', origin: 'student', text: 'a' }],
          },
          {
            id: 's-1',
            title: 'Two',
            level: 2,
            blocks: [{ type: 'paragraph', origin: 'ai-added', text: 'b' }],
          },
        ],
      } as unknown as Partial<NoteDocument>),
    );
    expect(result.document?.sections).toHaveLength(2);
    expect(new Set(result.document?.sections.map((s) => s.id)).size).toBe(2);
  });
});

describe('provenance and corrections', () => {
  it('re-marks a student block that a correction speaks to', () => {
    const result = validateNoteDocument(
      doc({
        sections: [
          {
            id: 's-1',
            title: 'One',
            level: 2,
            blocks: [
              {
                type: 'paragraph',
                origin: 'student',
                text: 'Atomic mass is exactly the same thing as molar mass, always.',
              },
            ],
          },
        ],
        corrections: [
          {
            sectionId: 's-1',
            original: 'Atomic mass is exactly the same thing as molar mass',
            corrected: 'They are numerically equal but measured in different units.',
            why: 'One is per atom and one is per mole.',
          },
        ],
      } as unknown as Partial<NoteDocument>),
    );
    expect(result.ok).toBe(true);
    expect(result.document?.sections[0]?.blocks[0]?.origin).toBe('ai-clarified');
  });

  it('gives a block with no provenance the conservative label', () => {
    const result = validateNoteDocument(
      doc({
        sections: [
          { id: 's-1', title: 'One', level: 2, blocks: [{ type: 'paragraph', text: 'a' }] },
        ],
      } as unknown as Partial<NoteDocument>),
    );
    expect(result.document?.sections[0]?.blocks[0]?.origin).toBe('ai-added');
  });
});

describe('stats and degrading', () => {
  it('counts what the AI added and corrected', () => {
    const result = validateNoteDocument(
      doc({
        sections: [
          {
            id: 's-1',
            title: 'One',
            level: 2,
            blocks: [
              { type: 'paragraph', origin: 'student', text: 'a' },
              { type: 'paragraph', origin: 'ai-added', text: 'b' },
              { type: 'paragraph', origin: 'ai-corrected', text: 'c' },
            ],
          },
        ],
      } as unknown as Partial<NoteDocument>),
    );
    expect(result.document?.stats).toEqual({ aiAdded: 1, aiCorrected: 1, openQuestions: 0 });
  });

  it('degrades by dropping what it could not verify and saying so', () => {
    const base = validateNoteDocument(
      doc({
        sections: [
          {
            id: 's-1',
            title: 'One',
            level: 2,
            blocks: [
              { type: 'paragraph', origin: 'student', text: 'kept' },
              { type: 'formula', origin: 'ai-added', latex: 'n = m/M', useWhen: 'when', where: [] },
            ],
          },
        ],
      } as unknown as Partial<NoteDocument>),
    );
    expect(base.ok).toBe(false);

    const degraded = degradeDocument(base.document!, base.issues);
    expect(degraded.sections[0]?.blocks).toHaveLength(1);
    expect(degraded.openQuestions).toHaveLength(1);
    expect(computeStats(degraded).aiAdded).toBe(0);
  });
});
