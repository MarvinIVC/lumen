import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { detectLocally, isConfident, mergeDetection } from '@/lib/curriculum/detect';
import { detectLanguage } from '@/lib/curriculum/language';
import { toBlocks } from '@/lib/ingest/normalize';
import { assessQuality } from '@/lib/ingest/quality';
import { estimateRun, formatCredits, formatDuration } from '@/lib/ingest/estimate';
import { capBlocks, mergeDocs, recount, splitDoc } from '@/lib/ingest/merge';
import { rtfToText } from '@/lib/ingest/rtf';
import type { ExtractedBlock, ExtractedDoc } from '@/lib/ingest/types';

const ROOT = resolve(import.meta.dirname, '../..');
const RAW = readFileSync(resolve(ROOT, 'fixtures/ap-chem-u1-raw.md'), 'utf8');
const REF = { sourceId: 'src_1', label: 'notes.md' };

/** What detection actually sees: the blocks, not the file — the comment is stripped by then. */
const FIXTURE_TEXT = toBlocks(RAW, REF)
  .map((block) => block.text)
  .join('\n\n');

describe('local detection (04-AI-ENGINE.md §3)', () => {
  it('reads the fixture without a model call', () => {
    const detected = detectLocally(FIXTURE_TEXT);

    expect(detected).toMatchObject({
      subject: 'Chemistry',
      curriculum: 'AP',
      course: 'AP Chemistry',
      language: 'en',
      isStudyNotes: true,
    });
    expect(detected.unit).toMatch(/Unit 1/);

    // Over the 0.7 bar, so the classify call in §3 never fires for the common case. This is the
    // whole economic argument for having a local pass at all.
    expect(detected.confidence).toBeGreaterThanOrEqual(0.7);
    expect(isConfident(detected)).toBe(true);
  });

  it('is unsure rather than wrong when the notes say nothing', () => {
    const detected = detectLocally('Tuesday. Remember to bring the thing. Ask about the trip.');
    expect(detected.subject).toBeNull();
    expect(detected.curriculum).toBe('UNKNOWN');
    expect(isConfident(detected)).toBe(false);
  });

  it('separates IB levels, and falls back to the IB when neither is stated', () => {
    expect(detectLocally('IB HL chemistry. Enthalpy, titration, equilibrium.').curriculum).toBe(
      'IB_HL',
    );
    expect(
      detectLocally(
        'Command term: outline. Paper 1 practice on enzymes, mitosis and osmosis. See the IA.',
      ).curriculum,
    ).toBe('IB_SL');
  });

  it('names the course the way the course is named', () => {
    expect(detectLocally('A-Level physics: velocity, momentum, torque, capacitor').course).toBe(
      'A-Level Physics',
    );
  });

  it('prefers the model where the two disagree', () => {
    const local = detectLocally(FIXTURE_TEXT);
    const merged = mergeDetection(local, {
      subject: 'Biology',
      curriculum: 'IB_HL',
      course: 'IB Biology HL',
      unit: 'Unit 2',
      topic: null,
      language: 'en',
      isStudyNotes: true,
      confidence: 0.9,
      notes: '',
    });
    expect(merged).toMatchObject({ subject: 'Biology', course: 'IB Biology HL', unit: 'Unit 2' });
  });

  it('falls back to the local answer when there is no model', () => {
    const local = detectLocally(FIXTURE_TEXT);
    expect(mergeDetection(local, null)).toMatchObject({
      subject: 'Chemistry',
      course: 'AP Chemistry',
    });
  });
});

describe('language', () => {
  it('reads the two locales this product actually ships', () => {
    expect(detectLanguage(FIXTURE_TEXT).language).toBe('en');
    expect(
      detectLanguage(
        '第三章 原子结构。同位素是质子数相同而中子数不同的原子。相对丰度是样品中某同位素的百分比。',
      ).language,
    ).toBe('zh');
  });

  it('is not flipped by a stray glyph of another script', () => {
    expect(detectLanguage(`${FIXTURE_TEXT}\n\n(molar mass 摩尔)`).language).toBe('en');
  });

  it('says it does not know rather than guessing from nothing', () => {
    expect(detectLanguage('x = 3').confidence).toBe(0);
  });
});

describe('the quality gate (01-PRODUCT.md §5)', () => {
  const block = (text: string, kind: ExtractedBlock['kind'] = 'paragraph'): ExtractedBlock => ({
    id: Math.random().toString(36),
    kind,
    text,
    pageRef: REF,
  });

  it('says nothing about real notes', () => {
    expect(assessQuality(toBlocks(RAW, REF)).warn).toBe(false);
  });

  it('warns on an essay, and still lets it through', () => {
    const essay = 'The causes of the war were manifold and deeply interwoven. '.repeat(20);
    const report = assessQuality([block(essay), block(essay), block(essay)]);
    expect(report.warn).toBe(true);
    expect(report.signals).toContain('essay-prose');
    expect(report.message).toContain('Carry on if you meant to');
  });

  it('does not warn on one long paragraph among many notes', () => {
    const blocks = [block('A long thought. '.repeat(50)), ...toBlocks(RAW, REF)];
    expect(assessQuality(blocks).warn).toBe(false);
  });
});

describe('merging and splitting', () => {
  const doc = (blocks: ExtractedBlock[], sourceId: string): ExtractedDoc => ({
    blocks,
    assets: [],
    meta: {
      charCount: blocks.reduce((total, entry) => total + entry.text.length, 0),
      pageCount: 1,
      sourceFiles: [
        {
          id: sourceId,
          name: `${sourceId}.md`,
          size: 10,
          mime: 'text/plain',
          kind: 'text',
          charCount: 10,
          parserVersion: 'text@1',
        },
      ],
    },
  });

  const make = (text: string, sourceId: string): ExtractedBlock => ({
    id: `${sourceId}-${text}`,
    kind: 'paragraph',
    text,
    pageRef: { sourceId, label: `${sourceId}.md` },
  });

  it('reads three files as one lesson, in the order they were added', () => {
    const merged = mergeDocs([
      doc([make('first', 'a')], 'a'),
      doc([make('second', 'b')], 'b'),
      doc([make('third', 'c')], 'c'),
    ]);
    expect(merged.blocks.map((entry) => entry.text)).toEqual(['first', 'second', 'third']);
    expect(merged.meta.sourceFiles).toHaveLength(3);
    // Every block still says where it came from — what makes "split into two lessons" meaningful.
    expect(merged.blocks.map((entry) => entry.pageRef.sourceId)).toEqual(['a', 'b', 'c']);
  });

  it('splits at a block boundary and re-counts both halves', () => {
    const merged = mergeDocs([
      doc([make('one', 'a'), make('two', 'a')], 'a'),
      doc([make('three', 'b')], 'b'),
    ]);
    const [head, tail] = splitDoc(merged, 2);

    expect(head.blocks.map((entry) => entry.text)).toEqual(['one', 'two']);
    expect(tail.blocks.map((entry) => entry.text)).toEqual(['three']);
    // The half that no longer contains a file's blocks no longer claims that file.
    expect(tail.meta.sourceFiles.map((file) => file.id)).toEqual(['b']);
  });

  it('drops a source from the count once its last block is deleted', () => {
    const merged = mergeDocs([doc([make('one', 'a')], 'a'), doc([make('two', 'b')], 'b')]);
    const pruned = recount({ ...merged, blocks: merged.blocks.filter((b) => b.text === 'one') });
    expect(pruned.meta.sourceFiles.map((file) => file.id)).toEqual(['a']);
  });

  it('caps at a block boundary rather than mid-sentence', () => {
    const blocks = Array.from({ length: 10 }, (_, index) => make('x'.repeat(100), `s${index}`));
    const { blocks: kept, dropped } = capBlocks(blocks, 350);
    expect(kept).toHaveLength(3);
    expect(dropped).toBe(7);
    expect(kept.every((entry) => entry.text.length === 100)).toBe(true);
  });

  it('always keeps at least one block, however long it is', () => {
    expect(capBlocks([make('y'.repeat(9999), 's')], 10).blocks).toHaveLength(1);
  });
});

describe('the cost estimate', () => {
  const base = { charCount: 3000, ocrPages: 0, language: 'en' as const };

  it('moves with the options a student can see', () => {
    const tidy = estimateRun({
      ...base,
      options: { mode: 'tidy', depth: 'brief', visuals: 'auto', voice: 'keep-mine' },
    });
    const guide = estimateRun({
      ...base,
      options: { mode: 'study_guide', depth: 'thorough', visuals: 'more', voice: 'keep-mine' },
    });

    expect(guide.credits).toBeGreaterThan(tidy.credits);
    expect(guide.costCny).toBeGreaterThan(tidy.costCny);
    expect(guide.seconds).toBeGreaterThan(tidy.seconds);
  });

  it('charges for OCR pages, per 02-ARCHITECTURE.md §7', () => {
    const options = {
      mode: 'complete',
      depth: 'match',
      visuals: 'auto',
      voice: 'keep-mine',
    } as const;
    const clean = estimateRun({ ...base, options });
    const scanned = estimateRun({ ...base, ocrPages: 4, options });
    expect(scanned.credits - clean.credits).toBeCloseTo(0.6, 5);
  });

  it('counts CJK at its real token cost', () => {
    const options = {
      mode: 'complete',
      depth: 'match',
      visuals: 'auto',
      voice: 'keep-mine',
    } as const;
    expect(estimateRun({ ...base, language: 'zh', options }).tokensIn).toBeGreaterThan(
      estimateRun({ ...base, options }).tokensIn * 2,
    );
  });

  it('speaks in credits and round numbers', () => {
    expect(formatCredits(1)).toBe('1 credit');
    expect(formatCredits(1.4)).toBe('1.4 credits');
    expect(formatDuration(38)).toBe('about 40 seconds');
    expect(formatDuration(190)).toBe('about 3 minutes');
  });
});

describe('rtf', () => {
  it('reads what TextEdit and WordPad save', () => {
    const rtf =
      '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Helvetica;}}' +
      '\\f0\\fs24 Atomic mass = molar mass\\par A mole is an amount\\par}';
    expect(rtfToText(rtf).trim()).toBe('Atomic mass = molar mass\nA mole is an amount');
  });

  it('skips the parts that are metadata, not notes', () => {
    const rtf = '{\\rtf1{\\colortbl;\\red255\\green0\\blue0;}{\\*\\generator Word}Real text\\par}';
    expect(rtfToText(rtf)).toContain('Real text');
    expect(rtfToText(rtf)).not.toContain('generator');
    expect(rtfToText(rtf)).not.toContain('red255');
  });

  it('decodes escapes and unicode', () => {
    // `\uN` is followed by the fallback character a non-Unicode reader would show, and it is
    // skipped rather than emitted — which is why the `?`s are there and why they do not appear.
    expect(rtfToText('{\\rtf1 caf\\u233? \\u8212? ok}').trim()).toBe('café — ok');
  });
});
