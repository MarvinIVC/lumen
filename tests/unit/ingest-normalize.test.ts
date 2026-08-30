import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  countChars,
  dehyphenate,
  stripRepeatedEdges,
  tidyWhitespace,
  toBlocks,
} from '@/lib/ingest/normalize';
import type { RawPage } from '@/lib/ingest/normalize';

/**
 * The normaliser is the only part of ingestion with no DOM in it, and it is where the quality of
 * everything downstream is decided: the model sees whatever comes out of here, and a page footer
 * left in becomes fourteen sentences the student is told they wrote.
 */
const ROOT = resolve(import.meta.dirname, '../..');
const RAW = readFileSync(resolve(ROOT, 'fixtures/ap-chem-u1-raw.md'), 'utf8');
const REF = { sourceId: 'src_1', label: 'notes.md' };

describe('block segmentation', () => {
  it('keeps the fixture’s headings, lists and prose apart', () => {
    const blocks = toBlocks(RAW, REF);
    const kinds = new Set(blocks.map((block) => block.kind));

    expect(kinds).toContain('heading');
    expect(kinds).toContain('list');
    expect(kinds).toContain('paragraph');
    expect(blocks[0]).toMatchObject({ kind: 'heading', text: '# AP Chem Unit 1', level: 1 });
    expect(blocks.some((block) => block.text.includes('mercury'))).toBe(true);
  });

  it('drops the authoring comment rather than treating it as notes', () => {
    // The fixture opens with an HTML comment that states the expected detection result. Left in,
    // it would make every detection test pass by reading its own answer key.
    const blocks = toBlocks(RAW, REF);
    expect(blocks.some((block) => block.text.includes('FIXTURE'))).toBe(false);
    expect(blocks.some((block) => block.text.includes('isStudyNotes'))).toBe(false);
  });

  it('gathers wrapped lines into one paragraph and bullets into one list', () => {
    const blocks = toBlocks('A sentence that\nwraps across lines.\n\n- one\n- two\n- three', REF);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      kind: 'paragraph',
      text: 'A sentence that wraps across lines.',
    });
    expect(blocks[1]).toMatchObject({ kind: 'list', text: '- one\n- two\n- three' });
  });

  it('reads an unpunctuated short line above content as a heading', () => {
    const blocks = toBlocks('Unit 3 — Bonding\nCovalent bonds share electrons.', REF);
    expect(blocks[0]).toMatchObject({ kind: 'heading', text: '## Unit 3 — Bonding' });
  });

  it('does not mistake a short sentence for a heading', () => {
    const blocks = toBlocks('A mole is an amount.\nAtomic mass is in amu.', REF);
    expect(blocks.every((block) => block.kind === 'paragraph')).toBe(true);
  });

  it('keeps a table together', () => {
    const blocks = toBlocks('| isotope | mass |\n| --- | --- |\n| C-12 | 12.000 |', REF);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.kind).toBe('table');
  });

  it('stamps every block with where it came from', () => {
    const blocks = toBlocks(RAW, REF);
    expect(blocks.every((block) => block.pageRef.sourceId === 'src_1')).toBe(true);
    expect(new Set(blocks.map((block) => block.id)).size).toBe(blocks.length);
  });
});

describe('whitespace and hyphenation', () => {
  it('joins a word split across a line wrap but leaves a real compound alone', () => {
    expect(dehyphenate('electro-\nnegativity')).toBe('electronegativity');
    expect(dehyphenate('acid-\nBase titration')).toBe('acid-\nBase titration');
  });

  it('replaces non-breaking spaces, which every later pattern would otherwise miss', () => {
    expect(tidyWhitespace('a b')).toBe('a b');
  });

  it('collapses runs of blank lines without merging paragraphs', () => {
    expect(tidyWhitespace('one\n\n\n\n\ntwo')).toBe('one\n\ntwo');
  });
});

describe('repeated headers and footers', () => {
  const page = (n: number, body: string): RawPage => ({
    pageRef: { sourceId: 's', page: n, label: `handout.pdf · p${n}` },
    text: `Mr Alvarez — AP Chemistry\n${body}\nPage ${n} of 5`,
  });

  it('removes the furniture that repeats at the same edge of most pages', () => {
    const stripped = stripRepeatedEdges([
      page(1, 'The mole'),
      page(2, 'Isotopes'),
      page(3, 'Mass spectra'),
      page(4, 'Formulas'),
      page(5, 'Review'),
    ]);

    expect(stripped.map((entry) => entry.text)).toEqual([
      'The mole',
      'Isotopes',
      'Mass spectra',
      'Formulas',
      'Review',
    ]);
  });

  it('leaves two pages alone — a line repeated twice is as likely to be content', () => {
    const pages = [page(1, 'The mole'), page(2, 'Isotopes')];
    expect(stripRepeatedEdges(pages)).toEqual(pages);
  });

  it('keeps a heading that recurs away from the edges', () => {
    // The window is deliberately narrow — two lines at each end. A recurring line inside it *is*
    // treated as furniture, which is the right call for "Mr Alvarez — AP Chemistry" on line one
    // and the wrong one for a section heading a student happens to put on line two. The student
    // sees the result on the review screen and can undo it by re-adding the file; a wider window
    // would eat real content on every scanned handout, which nothing would surface.
    const pages = [1, 2, 3, 4].map((n) => ({
      pageRef: { sourceId: 's', page: n, label: `p${n}` },
      text: `Top ${n}\nSecond ${n}\nDefinitions\nBody ${n}\nEnd ${n}`,
    }));
    expect(stripRepeatedEdges(pages).every((entry) => entry.text.includes('Definitions'))).toBe(
      true,
    );
  });
});

describe('counting', () => {
  it('measures the notes rather than the markup', () => {
    const blocks = toBlocks(RAW, REF);
    const total = countChars(blocks);
    expect(total).toBeGreaterThan(2000);
    expect(total).toBeLessThan(RAW.length);
  });
});
