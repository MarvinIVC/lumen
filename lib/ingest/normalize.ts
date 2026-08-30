/**
 * Turning a wall of extracted text into blocks (02-ARCHITECTURE.md §2, "extraction normaliser").
 *
 * Every parser lands here, so a `.txt` paste and a PDF text layer are segmented by exactly the
 * same rules and the review screen has one thing to render.
 *
 * The two jobs that are not obvious:
 *
 * - **Repeated headers and footers.** Every PDF of a school handout carries the teacher's name and
 *   a page number on all 14 pages. Left in, they become 14 "student wrote this" blocks that the
 *   model dutifully works into the study guide. They are found positionally — same edge of the
 *   page, same shape after digits are masked — rather than by pattern, because there is no pattern.
 * - **De-hyphenation.** A PDF text layer preserves the line-wrap hyphen, so "electro-" + newline +
 *   "negativity" reaches the model as two words. Only joined when the next line starts lowercase,
 *   which leaves real compounds ("acid-base") alone.
 */
import { newId } from './id';
import type { ExtractedBlock, PageRef } from './types';

/** One page's worth of raw text, before any of this runs. */
export interface RawPage {
  pageRef: PageRef;
  text: string;
}

const BULLET = /^\s*(?:[-*•·‣▪]|\d{1,2}[.)]|[a-z][.)])\s+/;
const SETEXT_UNDERLINE = /^\s*(={3,}|-{3,})\s*$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const ATX_HEADING = /^\s*(#{1,6})\s+(.*)$/;

/** Digits masked so "Page 3 of 14" and "Page 4 of 14" count as the same line. */
function fingerprint(line: string): string {
  return line.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
}

/**
 * Drops lines that repeat at the same edge of most pages.
 *
 * Needs at least three pages to have an opinion: on two pages a repeated line is as likely to be
 * a real recurring heading as furniture.
 */
export function stripRepeatedEdges(pages: RawPage[]): RawPage[] {
  if (pages.length < 3) return pages;

  const EDGE = 2;
  const counts = new Map<string, number>();
  const linesPerPage = pages.map((page) => page.text.split('\n'));

  for (const lines of linesPerPage) {
    const edges = new Set<string>();
    for (const line of lines.slice(0, EDGE)) edges.add(`head:${fingerprint(line)}`);
    for (const line of lines.slice(-EDGE)) edges.add(`foot:${fingerprint(line)}`);
    for (const edge of edges) counts.set(edge, (counts.get(edge) ?? 0) + 1);
  }

  const threshold = Math.max(3, Math.ceil(pages.length * 0.6));
  const furniture = new Set(
    [...counts.entries()]
      .filter(([key, count]) => count >= threshold && key.split(':').slice(1).join(':').length > 0)
      .map(([key]) => key),
  );
  if (furniture.size === 0) return pages;

  return pages.map((page, index) => {
    const lines = linesPerPage[index] ?? [];
    const keep = lines.filter((line, lineIndex) => {
      const fromEnd = lines.length - lineIndex;
      if (lineIndex < EDGE && furniture.has(`head:${fingerprint(line)}`)) return false;
      if (fromEnd <= EDGE && furniture.has(`foot:${fingerprint(line)}`)) return false;
      return true;
    });
    return { ...page, text: keep.join('\n') };
  });
}

/** Joins words split across a line wrap. See the module comment. */
export function dehyphenate(text: string): string {
  return text.replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2');
}

/** Normalises whitespace without destroying paragraph breaks. */
export function tidyWhitespace(text: string): string {
  return (
    text
      .replace(/\r\n?/g, '\n')
      // HTML/markdown comments are authoring notes, not content. A `.md` export from a note-taking
      // app is full of them and the model should never see one as something the student wrote.
      .replace(/<!--[\s\S]*?-->/g, '')
      // Non-breaking spaces: Word and PDF text layers are full of them, and they defeat every
      // whitespace pattern below if they are left in.
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/**
 * Line-level segmentation. Headings, lists, tables, everything else a paragraph.
 *
 * A bare line in ALL CAPS or Title Case with no terminal punctuation reads as a heading in a
 * student's notes even though nothing marks it as one — "1.1" and "Dimensional analysis" in the
 * AP Chem fixture are both headings and neither has a `#`. That guess is worth making: the review
 * screen shows the result and the student can fix it, and the alternative is a study guide with
 * no structure at all.
 */
export function toBlocks(text: string, pageRef: PageRef): ExtractedBlock[] {
  const lines = tidyWhitespace(dehyphenate(text)).split('\n');
  const blocks: ExtractedBlock[] = [];

  let paragraph: string[] = [];
  let list: string[] = [];
  let table: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    push('paragraph', paragraph.join(' ').trim());
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    push('list', list.join('\n'));
    list = [];
  };
  const flushTable = () => {
    if (!table.length) return;
    push('table', table.join('\n'));
    table = [];
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushTable();
  };
  const push = (kind: ExtractedBlock['kind'], value: string, level?: number) => {
    if (!value.trim()) return;
    blocks.push({
      id: newId('blk'),
      kind,
      text: value,
      pageRef,
      ...(level ? { level } : {}),
    });
  };

  lines.forEach((line, index) => {
    const next = lines[index + 1] ?? '';

    if (!line.trim()) {
      flushAll();
      return;
    }

    const atx = ATX_HEADING.exec(line);
    if (atx) {
      flushAll();
      push('heading', `${atx[1]} ${atx[2]?.trim() ?? ''}`, atx[1]?.length ?? 1);
      return;
    }

    // Setext: the underline belongs to the line above, which is therefore not a paragraph.
    if (SETEXT_UNDERLINE.test(next) && line.trim()) {
      flushAll();
      const level = next.trim().startsWith('=') ? 1 : 2;
      push('heading', `${'#'.repeat(level)} ${line.trim()}`, level);
      return;
    }
    if (SETEXT_UNDERLINE.test(line)) return;

    if (TABLE_ROW.test(line)) {
      flushParagraph();
      flushList();
      table.push(line.trim());
      return;
    }
    flushTable();

    if (BULLET.test(line)) {
      flushParagraph();
      list.push(`- ${line.replace(BULLET, '').trim()}`);
      return;
    }

    // A continuation line indented under a bullet stays with that bullet.
    if (list.length && /^\s{2,}\S/.test(line)) {
      list[list.length - 1] = `${list[list.length - 1]} ${line.trim()}`;
      return;
    }
    flushList();

    if (looksLikeHeading(line, next)) {
      flushParagraph();
      push('heading', `## ${line.trim()}`, 2);
      return;
    }

    paragraph.push(line.trim());
  });

  flushAll();
  return blocks;
}

/**
 * A short unpunctuated line with something under it. Deliberately conservative — a false heading
 * is a visible mistake on the review screen, and a missed one costs nothing but a flat outline.
 */
function looksLikeHeading(line: string, next: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 60) return false;
  if (/[.,;:?!]$/.test(trimmed)) return false;
  if (!next.trim()) return false;
  if (BULLET.test(trimmed)) return false;
  // "1.1", "Unit 3", "Chapter 2 — Bonding", "第三章"
  if (/^(\d+(\.\d+)*|[IVX]+\.?)(\s|$)/.test(trimmed)) return true;
  if (/^(unit|topic|chapter|section|lesson|part)\b/i.test(trimmed)) return true;
  if (/^第.{1,3}[章节課课]/.test(trimmed)) return true;
  // ALL CAPS, at least two words, not an acronym on its own.
  if (/^[A-Z][A-Z\s&/-]{4,}$/.test(trimmed) && trimmed.includes(' ')) return true;
  return false;
}

/** Total characters of note content, for the caps and the cost estimate. */
export function countChars(blocks: ExtractedBlock[]): number {
  return blocks.reduce((total, block) => total + block.text.length, 0);
}
