/**
 * The export model and the inline emitters (06 §2).
 *
 * Four formats share one model and one inline parser, so the interesting cases are the ones where
 * a format could quietly disagree with the others: what the two toggles mean, where a margin note
 * ends up, and what happens to a character the student typed themselves.
 */
import { describe, expect, it } from 'vitest';

import { buildExportModel, visualBlocks } from '@/lib/export/model';
import { toAnkiHtml, toMarkdown, toPlainText } from '@/lib/export/inline';
import { assignBlockIds } from '@/lib/ai/validate';
import { goldFixture } from '@/lib/render/fixture/gold';
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
    summary: 'A summary.',
    objectives: [],
    sections: [{ id: 's-1', title: 'Moles', level: 2, blocks }],
    corrections: [],
    openQuestions: [],
    factCheck: { calculationsVerified: [], checkedClaims: 0, flags: [] },
    studyTools: { flashcards: [], quiz: [] },
    glossary: [],
    ...extra,
  } as NoteDocument);
}

const paragraph = (text: string, origin: Block['origin'] = 'student'): Block =>
  ({ type: 'paragraph', origin, text }) as Block;

describe('buildExportModel', () => {
  it('lifts margin notes out of the flow and anchors them to the block before', () => {
    const model = buildExportModel(
      docOf([
        paragraph('First.'),
        { type: 'marginNote', origin: 'student', kind: 'mnemonic', text: 'MR NOAH' } as Block,
        paragraph('Second.'),
      ]),
    );

    expect(model.sections[0]!.blocks).toHaveLength(2);
    expect(model.endnotes).toEqual([
      { number: 1, kind: 'mnemonic', text: 'MR NOAH', origin: 'student' },
    ]);
    // The marker hangs on "First." — where a reader on a wide screen would have looked.
    expect(model.sections[0]!.blocks[0]!.endnotes).toEqual([1]);
    expect(model.sections[0]!.blocks[1]!.endnotes).toEqual([]);
  });

  it('keeps an unanchored note at the top of a section, without an in-text marker', () => {
    const model = buildExportModel(
      docOf([
        { type: 'marginNote', origin: 'student', kind: 'mnemonic', text: 'Mine' } as Block,
        paragraph('After.'),
      ]),
    );

    expect(model.endnotes.map((note) => note.text)).toEqual(['Mine']);
    expect(model.sections[0]!.blocks.every((row) => row.endnotes.length === 0)).toBe(true);
  });

  it('drops the study tools but never the corrections when study tools are off', () => {
    const doc = docOf([paragraph('Body.')], {
      corrections: [{ sectionId: 's-1', original: 'a', corrected: 'b', why: 'because' }],
      openQuestions: [{ sectionId: 's-1', question: 'q', why: 'w' }],
      studyTools: {
        flashcards: [{ front: 'f', back: 'b', sectionId: 's-1' }],
        quiz: [
          {
            kind: 'short-answer',
            prompt: 'p',
            answer: 'a',
            explanation: 'e',
            sectionId: 's-1',
          },
        ],
      },
    });

    const off = buildExportModel(doc, { includeStudyTools: false, includeProvenance: true });
    expect(off.flashcards).toEqual([]);
    expect(off.quiz).toEqual([]);
    // 06 §5.1 and §5.3: these are the trust surface, not a study tool. They ship regardless.
    expect(off.corrections).toHaveLength(1);
    expect(off.openQuestions).toHaveLength(1);
  });

  it('drops the provenance marks without dropping the AI blocks they mark', () => {
    const doc = docOf([paragraph('Mine.', 'student'), paragraph('Added.', 'ai-added')]);

    const model = buildExportModel(doc, { includeStudyTools: true, includeProvenance: false });
    expect(model.sections[0]!.blocks).toHaveLength(2);
    expect(model.sections[0]!.blocks.map((row) => row.origin)).toEqual([null, null]);
  });

  it('numbers figures across sections, in document order', () => {
    const doc = docOf([], {
      sections: [
        {
          id: 's-1',
          title: 'One',
          level: 2,
          blocks: [
            { type: 'structure', origin: 'ai-added', smiles: 'CCO', caption: 'a', alt: 'a' },
          ] as Block[],
        },
        {
          id: 's-2',
          title: 'Two',
          level: 2,
          blocks: [
            {
              type: 'diagram',
              origin: 'ai-added',
              engine: 'mermaid',
              source: 'graph TD; a-->b',
              caption: 'b',
              alt: 'b',
            },
          ] as Block[],
        },
      ],
    });

    const model = buildExportModel(doc);
    expect(visualBlocks(model).map((row) => row.figureNumber)).toEqual([1, 2]);
  });

  it('carries the gold fixture through with its sections and corrections intact', () => {
    const model = buildExportModel(goldFixture());
    expect(model.breadcrumb).toBe('AP Chemistry · Unit 1 (Topics 1.1–1.4)');
    expect(model.sections.length).toBeGreaterThan(3);
    expect(model.corrections.length).toBeGreaterThan(0);
  });
});

describe('inline emitters', () => {
  it('parses a bold run that contains maths, in every format', () => {
    const text = '**mass-to-charge ratio ($m/z$)**';
    expect(toMarkdown(text, 'ai-added')).toBe('**mass\\-to\\-charge ratio \\($m/z$\\)**');
    expect(toAnkiHtml(text, 'ai-added')).toBe('<b>mass-to-charge ratio (\\(m/z\\))</b>');
    expect(toPlainText(text, 'ai-added')).toBe('mass-to-charge ratio (m/z)');
  });

  it('emits student text verbatim rather than parsing it', () => {
    // Phase-05's open question. On screen the asterisk becomes emphasis; in a file it would be
    // gone for good, and Obsidian would re-apply the same rule on every open.
    const text = 'the * marks the limiting reagent';
    expect(toMarkdown(text, 'student')).toBe('the \\* marks the limiting reagent');
    expect(toPlainText(text, 'student')).toBe(text);
    expect(toAnkiHtml(text, 'student')).toBe('the * marks the limiting reagent');
  });

  it('keeps chemistry maths as MathJax delimiters for Anki and as $$ for Markdown', () => {
    const text = 'Balanced: $$\\ce{2H2 + O2 -> 2H2O}$$';
    expect(toMarkdown(text, 'ai-added')).toContain('$$\\ce{2H2 + O2 -> 2H2O}$$');
    expect(toAnkiHtml(text, 'ai-added')).toContain('\\[\\ce{2H2 + O2 -> 2H2O}\\]');
  });

  it('renders an unsafe href as characters rather than as a link', () => {
    const text = '[click](javascript:alert(1))';
    expect(toAnkiHtml(text, 'ai-added')).not.toContain('<a ');
    expect(toPlainText(text, 'ai-added')).toContain('javascript:');
  });

  it('escapes HTML rather than passing it through to Anki', () => {
    expect(toAnkiHtml('<script>x</script>', 'ai-added')).toBe('&lt;script&gt;x&lt;/script&gt;');
  });
});
