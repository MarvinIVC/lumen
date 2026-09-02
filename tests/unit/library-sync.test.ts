/**
 * The parts of the library and the sync engine that decide what a student can find, what leaves
 * this browser, and where a sign-in sends them.
 *
 * None of these need IndexedDB — and that is the point. `getDb()` returns `null` in node, so
 * everything that touches a store is a no-op here and belongs to the end-to-end suite. What is
 * left is the logic that is wrong silently: a search projection that drops the body, a thumbnail
 * that a title can break, a combined deck that repeats itself, and a `next=` that leaves the app.
 */
import { describe, expect, it } from 'vitest';

import { safeAppNext } from '@/lib/auth/safe-next';
import { combineFlashcards, flattenDocument, searchLocalNotes } from '@/lib/store/library';
import { readableMath, renderThumbnail } from '@/lib/store/thumbnails';
import { assignBlockIds } from '@/lib/ai/validate';
import type { Block, Flashcard, NoteDocument } from '@/lib/ai/schema';
import type { LocalNote } from '@/lib/store/types';

function docOf(overrides: Partial<NoteDocument> = {}): NoteDocument {
  const blocks: Block[] = [
    { type: 'paragraph', text: 'A mole is 6.022e23 things.', origin: 'student' },
    { type: 'paragraph', text: 'Avogadro constant, symbol N_A.', origin: 'ai-added' },
  ];
  return assignBlockIds({
    schemaVersion: '1.1.0',
    promptVersion: '1.3.0',
    title: 'Moles and molar mass',
    context: {
      subject: 'Chemistry',
      curriculum: 'AP',
      course: 'AP Chemistry',
      unit: 'Unit 1',
      topic: null,
      language: 'en',
    },
    options: { mode: 'complete', depth: 'match', visuals: 'auto', voice: 'keep-mine' },
    summary: 'Counting particles by weighing them.',
    objectives: ['Convert grams to moles.'],
    sections: [{ id: 's-1', title: 'The mole', level: 2, blocks }],
    corrections: [],
    openQuestions: [{ id: 'q-1', question: 'Why 6.022?', why: 'The number is not derived here.' }],
    factCheck: { calculationsVerified: [], checkedClaims: 0, flags: [] },
    studyTools: { flashcards: [], quiz: [] },
    glossary: [{ term: 'Stoichiometry', definition: 'Reaction arithmetic.', sectionId: 's-1' }],
    ...overrides,
  } as NoteDocument);
}

function noteOf(title: string, generated?: NoteDocument): LocalNote {
  return {
    id: `nte_${title.replaceAll(' ', '')}`,
    localId: `local-${title}`,
    createdAt: 0,
    updatedAt: 0,
    title,
    status: 'ready',
    context: {
      subject: 'Chemistry',
      curriculum: 'AP',
      course: 'AP Chemistry',
      unit: 'Unit 1',
      topic: null,
      language: 'en',
    },
    options: { mode: 'complete', depth: 'match', visuals: 'auto', voice: 'keep-mine' },
    draftId: 'drf_1',
    source: { kind: 'paste', filenames: [], extractedCharCount: 0, ocrPages: 0 },
    doc: { blocks: [], meta: { charCount: 0, pageCount: 0, sourceFiles: [] } },
    generated,
  };
}

const card = (front: string, back: string): Flashcard => ({ front, back, sectionId: 's-1' });

describe('the search projection', () => {
  it('carries the body, not only the title', () => {
    const flat = flattenDocument(docOf());
    expect(flat).toContain('A mole is 6.022e23 things.');
    expect(flat).toContain('Avogadro constant, symbol N_A.');
    expect(flat).toContain('Counting particles by weighing them.');
    expect(flat).toContain('Stoichiometry');
    expect(flat).toContain('Why 6.022?');
  });

  it('keeps block ids and origins out of it', () => {
    // These go to Postgres as `note.search_text`. A student searching "student" or "paragraph"
    // would otherwise match every note they own.
    const flat = flattenDocument(docOf());
    expect(flat).not.toContain('paragraph');
    expect(flat).not.toContain('student');
    expect(flat).not.toContain('ai-added');
    expect(flat).not.toMatch(/\bs-1\b/);
  });

  it('is empty rather than undefined for a note that has never been generated', () => {
    expect(flattenDocument(undefined)).toBe('');
  });
});

describe('local search', () => {
  const notes = [noteOf('Moles', docOf()), noteOf('Thermodynamics')];

  it('returns everything when the box is empty or only spaces', () => {
    expect(searchLocalNotes(notes, '')).toHaveLength(2);
    expect(searchLocalNotes(notes, '   ')).toHaveLength(2);
  });

  it('matches inside the generated document, not just the title', () => {
    expect(searchLocalNotes(notes, 'avogadro').map((note) => note.title)).toEqual(['Moles']);
  });

  it('requires every term, so a second word narrows rather than widens', () => {
    expect(searchLocalNotes(notes, 'mole avogadro')).toHaveLength(1);
    expect(searchLocalNotes(notes, 'mole helium')).toHaveLength(0);
  });
});

describe('combining a unit into one deck', () => {
  it('drops the duplicate a shared unit produces, ignoring case and spacing', () => {
    const first = noteOf(
      'Lesson one',
      docOf({
        studyTools: {
          flashcards: [card('What is a mole?', '6.022e23 things'), card('Molar mass?', 'g/mol')],
          quiz: [],
        },
      }),
    );
    const second = noteOf(
      'Lesson two',
      docOf({
        studyTools: {
          flashcards: [card('what is a Mole? ', '6.022e23 things'), card('Avogadro?', 'N_A')],
          quiz: [],
        },
      }),
    );
    const combined = combineFlashcards([first, second]);
    expect(combined.map((entry) => entry.front)).toEqual([
      'What is a mole?',
      'Molar mass?',
      'Avogadro?',
    ]);
  });

  it('is empty for notes that have no cards rather than throwing', () => {
    expect(combineFlashcards([noteOf('Nothing yet')])).toEqual([]);
  });
});

describe('the saved thumbnail', () => {
  it('escapes a title that would otherwise close the SVG', () => {
    const svg = renderThumbnail(docOf({ title: 'Acids <script>alert(1)</script> & bases' }));
    expect(svg).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(svg).toContain('&amp;');
    expect(svg).not.toContain('<script>');
    // Storage serves this file back to the browser; an unbalanced tag would be a broken card at
    // best and injected markup at worst.
    expect(svg.match(/<svg/g)).toHaveLength(1);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
  });

  it('wraps a long title instead of running it off the edge', () => {
    // Phase-07 put this file in front of strangers as a share link's Open Graph card, and SVG
    // `<text>` does not wrap: the real AP Chem title came out as "Atomic Structure and Properties
    // — the mo" with the rest outside the picture. Every lesson title is this long.
    const svg = renderThumbnail(
      docOf({ title: 'Atomic Structure and Properties — the mole, isotopes and formulas' }),
    );
    const titles = [...svg.matchAll(/class="title">([^<]*)</g)].map((match) => match[1]!);
    expect(titles.length).toBeGreaterThan(1);
    for (const line of titles) expect(line.length).toBeLessThanOrEqual(40);
    expect(titles.join(' ')).toContain('Atomic Structure');
  });

  it('makes maths readable rather than printing LaTeX at a reader', () => {
    expect(readableMath('6.022\\times10^{23}')).toBe('6.022×10²³');
    expect(readableMath('\\ce{H2O}')).toBe('H2O');
    expect(readableMath('\\dfrac{m}{M}')).toBe('m/M');
    expect(readableMath('\\ce{A <=> B}')).toBe('A <=> B');
    // A command this does not know loses its name rather than showing it.
    expect(readableMath('x \\qquad y')).toBe('x y');
    // LaTeX's spacing commands are a backslash and one punctuation mark, and left a stray slash.
    expect(readableMath('6.022\\times10^{23}\\ \\text{mol}^{-1}')).toBe('6.022×10²³ mol⁻¹');
  });

  it('strips inline syntax rather than printing it at a reader', () => {
    // The card is built from the document's own text, and the document is written in the
    // restricted markdown the renderer parses — so without this a chemistry note put
    // `$6.022\times10^{23}$` on a public card verbatim.
    const svg = renderThumbnail(
      docOf({
        title: 'The **mole**',
        summary: 'One mole is $6.022\\times10^{23}$ particles.',
      }),
    );
    expect(svg).not.toContain('$');
    expect(svg).not.toContain('\\times');
    expect(svg).not.toContain('**');
    expect(svg).toContain('The mole');
    expect(svg).toContain('6.022×10²³');
  });

  it('makes the body legible too, not only the summary', () => {
    // The body is the longest text on the card and comes straight out of the blocks, so it is the
    // one most likely to be carrying LaTeX. It took its own fix.
    const svg = renderThumbnail(
      docOf({
        summary: 'Plain.',
        sections: [
          {
            id: 's-1',
            title: 'The mole',
            level: 2,
            blocks: [
              {
                type: 'paragraph',
                origin: 'ai-added',
                text: 'One mole is $6.022\\times10^{23}$ particles of $\\ce{H2O}$.',
              },
            ],
          },
        ],
      }),
    );
    expect(svg).not.toContain('\\times');
    expect(svg).not.toContain('\\ce{');
    expect(svg).toContain('6.022×10²³');
  });

  it('renders a document with no sections at all', () => {
    const svg = renderThumbnail(docOf({ sections: [], summary: '' }));
    expect(svg).toContain('Study guide');
  });
});

describe('where a sign-in returns to', () => {
  it('keeps an in-app destination', () => {
    expect(safeAppNext('/app/note/nte_1?mode=edit')).toBe('/app/note/nte_1?mode=edit');
  });

  it('refuses anything that would leave the app', () => {
    for (const value of [
      null,
      undefined,
      '',
      '//evil.example.com',
      'https://evil.example.com/app',
      '/zh/pricing',
      'javascript:alert(1)',
    ]) {
      expect(safeAppNext(value)).toBe('/app/library');
    }
  });
});
