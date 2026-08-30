import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  MAX_BYTES,
  MAX_PAGES,
  SOFT_PAGE_LIMIT,
  extensionOf,
  isAccepted,
} from '@/lib/ingest/limits';

/**
 * The two generated binary fixtures (`pnpm fixtures:ingest`).
 *
 * The `.docx` is only a fair test of the Word path if it holds the *same notes* as the markdown —
 * otherwise "upload the fixture both ways and compare" compares two unrelated files. This asserts
 * that, and that both stay inside the caps they are meant to exercise.
 */
const ROOT = resolve(import.meta.dirname, '../..');
const DOCX = resolve(ROOT, 'fixtures/ap-chem-u1-raw.docx');
const PDF = resolve(ROOT, 'fixtures/scanned-worksheet.pdf');
const RAW = readFileSync(resolve(ROOT, 'fixtures/ap-chem-u1-raw.md'), 'utf8');

/** `word/document.xml`, read straight out of the zip. Node ships the unzipper as `unzip`. */
function documentXml(): string {
  return execFileSync('unzip', ['-p', DOCX, 'word/document.xml'], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
}

describe('the .docx fixture', () => {
  it('holds the same notes as the markdown', () => {
    const xml = documentXml();
    const lines = RAW.replace(/<!--[\s\S]*?-->/g, '')
      .split('\n')
      .map((line) => line.replace(/^[-*#]+\s*/, '').trim())
      .filter((line) => line.length > 20 && !line.includes('<'));

    expect(lines.length).toBeGreaterThan(15);
    for (const line of lines) {
      const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      expect(xml, `missing from the .docx: ${line}`).toContain(escaped);
    }
  });

  it('carries Word’s own structure, not just text', () => {
    const xml = documentXml();
    // Heading levels and list numbering are what make this a better source than a text file, and
    // what `htmlToBlocks` reads back out instead of guessing.
    expect(xml).toContain('w:val="Heading1"');
    expect(xml).toContain('w:val="Heading2"');
    expect(xml).toContain('<w:numPr>');
  });

  it('is small enough to commit and well inside the size cap', () => {
    const size = statSync(DOCX).size;
    expect(size).toBeLessThan(64 * 1024);
    expect(size).toBeLessThan(MAX_BYTES);
  });
});

describe('the scanned-PDF fixture', () => {
  it('is a PDF with pages and no text at all', () => {
    const bytes = readFileSync(PDF);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    const body = bytes.toString('latin1');
    expect(body).toContain('/Type /Pages');
    expect(body).toContain('/Subtype /Image');
    // No font and no text-showing operator: there is nothing for a text layer to be made of.
    expect(body).not.toContain('/Type /Font');
    expect(body).not.toMatch(/\bBT\b/);
  });

  it('has fewer pages than the cap, so it tests OCR rather than the page limit', () => {
    const pages = /\/Type \/Pages \/Count (\d+)/.exec(readFileSync(PDF).toString('latin1'));
    expect(Number(pages?.[1])).toBeGreaterThan(1);
    expect(Number(pages?.[1])).toBeLessThan(MAX_PAGES);
  });
});

describe('the cap and lock fixtures', () => {
  const pageCount = (file: string) => {
    const body = readFileSync(resolve(ROOT, 'fixtures', file)).toString('latin1');
    return Number(/\/Type \/Pages \/Count (\d+)/.exec(body)?.[1]);
  };

  it('straddles the soft page limit and the hard one', () => {
    // One either side of each line in 02-ARCHITECTURE.md §7, so both branches are walkable.
    expect(pageCount('long-scan-45p.pdf')).toBeGreaterThan(SOFT_PAGE_LIMIT);
    expect(pageCount('long-scan-45p.pdf')).toBeLessThanOrEqual(MAX_PAGES);
    expect(pageCount('too-many-pages-61p.pdf')).toBeGreaterThan(MAX_PAGES);
  });

  it('ships a genuinely encrypted PDF, not one that merely says it is', () => {
    const body = readFileSync(resolve(ROOT, 'fixtures/locked-worksheet.pdf')).toString('latin1');
    expect(body).toContain('/Filter /Standard');
    expect(body).toContain('/Encrypt');
    // The trailer id is an input to the key; without it the file cannot be opened at all.
    expect(body).toMatch(/\/ID \[<[0-9a-f]{32}> <[0-9a-f]{32}>\]/);
  });

  it('keeps the cap fixtures small — they exist to be counted, not read', () => {
    for (const file of ['long-scan-45p.pdf', 'too-many-pages-61p.pdf', 'locked-worksheet.pdf']) {
      expect(statSync(resolve(ROOT, 'fixtures', file)).size, file).toBeLessThan(64 * 1024);
    }
  });
});

describe('accepted types', () => {
  it('takes everything 01-PRODUCT.md §2 promises', () => {
    for (const name of [
      'notes.docx',
      'handout.pdf',
      'notes.md',
      'notes.txt',
      'notes.rtf',
      'board.png',
      'board.JPG',
      'board.jpeg',
      'IMG_2211.heic',
      'shot.webp',
    ]) {
      expect(isAccepted(name), name).toBe(true);
    }
  });

  it('refuses what it cannot read', () => {
    for (const name of ['deck.pptx', 'sheet.xlsx', 'lecture.mp4', 'notes.pages', 'archive.zip']) {
      expect(isAccepted(name), name).toBe(false);
    }
  });

  it('reads the extension off the last dot, case-insensitively', () => {
    expect(extensionOf('unit 1 notes v2.final.DOCX')).toBe('.docx');
    expect(extensionOf('no-extension')).toBe('');
  });
});
