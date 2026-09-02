import type { NoteDocument } from '@/lib/ai/schema';

import { stripInline } from '@/lib/render/markdown/strip';

import { getDb } from './db';
import { queueMutation } from './outbox';
import type { StoredAsset } from './types';

const WIDTH = 800;
const HEIGHT = 500;

/**
 * Render a quiet, deterministic first-page preview at save time. SVG is deliberate: it stays
 * crisp, is tiny enough for the outbox, and can be rendered without loading the editor bundle.
 */
export async function saveNoteThumbnail(
  noteId: string,
  document: NoteDocument,
  queue = true,
): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const assetId = `thumbnail:${noteId}`;
  const bytes = new TextEncoder().encode(renderThumbnail(document)).buffer;
  const asset: StoredAsset = {
    id: assetId,
    noteId,
    sourceId: noteId,
    kind: 'note-thumbnail',
    mime: 'image/svg+xml',
    bytes,
    width: WIDTH,
    height: HEIGHT,
    alt: '',
  };
  await db.put('assets', asset);
  if (queue) await queueMutation('asset', assetId);
  return assetId;
}

/**
 * Exported for the escaping test: a title with an angle bracket must not corrupt the SVG.
 *
 * Two things here are not cosmetic, and phase-07 found both by putting this file in front of
 * strangers as a share link's Open Graph card:
 *
 * **The title wraps.** SVG `<text>` does not, so a long one simply ran off the right-hand edge and
 * out of the picture — "Atomic Structure and Properties — the mo". Every AP lesson title is long.
 *
 * **Everything is stripped of inline syntax.** The text is pulled straight out of the document's
 * blocks, and the document is written in the restricted markdown the renderer parses — so a
 * chemistry note put `$6.022\times10^{23}$` on the card, verbatim, where a reader expects a
 * sentence. `stripInline` is the same function the outline rail and every `alt` attribute use.
 */
export function renderThumbnail(document: NoteDocument): string {
  const titleLines = wrap(readable(document.title || 'Untitled lesson'), 34, 2);
  const summaryTop = titleLines.length > 1 ? 172 : 146;
  const summary = wrap(readable(document.summary), 68, 2);
  const section = document.sections[0];
  const heading = xml(readable(section?.title ?? 'Study guide'));
  const lines = section
    ? wrap(readable(section.blocks.flatMap((block) => blockLines(block)).join(' ')), 76, 7)
    : [];
  const titleText = titleLines
    .map((line, index) => `<text x="58" y="${76 + index * 40}" class="title">${xml(line)}</text>`)
    .join('');
  const summaryText = summary
    .map(
      (line, index) =>
        `<text x="58" y="${summaryTop + index * 25}" class="summary">${xml(line)}</text>`,
    )
    .join('');
  const bodyText = lines
    .map((line, index) => `<text x="58" y="${272 + index * 24}" class="body">${xml(line)}</text>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="800" height="500" fill="#fbfaf6"/>
  <rect x="0" y="0" width="10" height="500" fill="#315f9a"/>
  <style>.title{font:700 34px ui-serif,Georgia,serif;fill:#18202a}.summary{font:18px ui-sans-serif,system-ui,sans-serif;fill:#566170}.heading{font:700 20px ui-sans-serif,system-ui,sans-serif;fill:#315f9a}.body{font:17px ui-sans-serif,system-ui,sans-serif;fill:#384453}</style>
  ${titleText}
  ${summaryText}
  <line x1="58" y1="218" x2="742" y2="218" stroke="#d7d4cc"/>
  <text x="58" y="250" class="heading">${heading}</text>
  ${bodyText}
</svg>`;
}

function blockLines(value: unknown, key = ''): string[] {
  if (typeof value === 'string') {
    return ['id', 'type', 'origin', 'anchorId', 'assetId', 'originalText'].includes(key)
      ? []
      : [value];
  }
  if (Array.isArray(value)) return value.flatMap((item) => blockLines(item, key));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([childKey, child]) => blockLines(child, childKey));
}

function wrap(value: string, width: number, limit: number): string[] {
  const words = value.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  for (const word of words) {
    const current = lines.at(-1);
    if (!current || current.length + word.length + 1 > width) {
      if (lines.length === limit) break;
      lines.push(word);
    } else {
      lines[lines.length - 1] = `${current} ${word}`;
    }
  }
  if (words.length && lines.length === limit) lines[limit - 1] = `${lines[limit - 1]}…`;
  return lines;
}

/** Inline syntax out, maths made legible. Everything on this card goes through it. */
function readable(value: string): string {
  return readableMath(stripInline(value));
}

/**
 * LaTeX, as something a person can read at a glance.
 *
 * `stripInline` unwraps `$…$` to its contents, which is right for an `alt` attribute and wrong
 * here: a card that says `6.022\times10^{23}` is showing a reader source code. This is not a
 * renderer and does not try to be — it handles the handful of things that actually turn up in the
 * first paragraph of a science note and drops the rest, so the sentence still reads.
 */
const SYMBOLS: [RegExp, string][] = [
  [/\\times/g, '×'],
  [/\\cdot/g, '·'],
  [/\\approx/g, '≈'],
  [/\\le(?![a-z])/g, '≤'],
  [/\\ge(?![a-z])/g, '≥'],
  [/\\pm/g, '±'],
  [/\\rightarrow|\\to(?![a-z])/g, '→'],
  [/\\leftrightarrow|\\rightleftharpoons/g, '⇌'],
  [/\\degree|\\circ(?![a-z])/g, '°'],
];

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '-': '⁻',
  '+': '⁺',
};

const SUBSCRIPT: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
};

function script(value: string, table: Record<string, string>): string | null {
  const mapped = [...value].map((character) => table[character]);
  return mapped.every(Boolean) ? mapped.join('') : null;
}

export function readableMath(value: string): string {
  let text = value
    .replace(/\\(?:ce|text|mathrm|mathbf)\{([^{}]*)\}/g, '$1')
    .replace(/\\d?frac\{([^{}]*)\}\{([^{}]*)\}/g, '$1/$2');

  for (const [pattern, symbol] of SYMBOLS) text = text.replace(pattern, symbol);

  text = text
    .replace(/\^\{?([0-9+-]+)\}?/g, (match, digits: string) => script(digits, SUPERSCRIPT) ?? match)
    .replace(/_\{?([0-9]+)\}?/g, (match, digits: string) => script(digits, SUBSCRIPT) ?? match)
    // LaTeX's spacing commands are a backslash and one punctuation mark; they leave a stray
    // slash behind — "6.022×10²³\\ mol⁻¹" — if only the word-shaped ones are handled.
    .replace(/\\[,;:!> ]/g, ' ')
    // Anything still carrying a backslash is a command this does not know, and its name is not
    // worth showing anybody.
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return text;
}

function xml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
