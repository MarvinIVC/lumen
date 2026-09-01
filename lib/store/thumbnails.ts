import type { NoteDocument } from '@/lib/ai/schema';

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

/** Exported for the escaping test: a title with an angle bracket must not corrupt the SVG. */
export function renderThumbnail(document: NoteDocument): string {
  const title = xml(document.title || 'Untitled lesson');
  const summary = wrap(document.summary, 68, 2);
  const section = document.sections[0];
  const heading = xml(section?.title ?? 'Study guide');
  const lines = section
    ? wrap(section.blocks.flatMap((block) => blockLines(block)).join(' '), 76, 7)
    : [];
  const summaryText = summary
    .map(
      (line, index) => `<text x="58" y="${146 + index * 25}" class="summary">${xml(line)}</text>`,
    )
    .join('');
  const bodyText = lines
    .map((line, index) => `<text x="58" y="${272 + index * 24}" class="body">${xml(line)}</text>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="800" height="500" fill="#fbfaf6"/>
  <rect x="0" y="0" width="10" height="500" fill="#315f9a"/>
  <style>.title{font:700 34px ui-serif,Georgia,serif;fill:#18202a}.summary{font:18px ui-sans-serif,system-ui,sans-serif;fill:#566170}.heading{font:700 20px ui-sans-serif,system-ui,sans-serif;fill:#315f9a}.body{font:17px ui-sans-serif,system-ui,sans-serif;fill:#384453}</style>
  <text x="58" y="78" class="title">${title}</text>
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

function xml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
