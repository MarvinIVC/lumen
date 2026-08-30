/**
 * HTML → blocks, for the one parser that produces HTML (mammoth, on `.docx`).
 *
 * Going through the DOM rather than through text is what keeps a Word heading a heading and a
 * numbered list a numbered list. Word's own structure is the best structural signal we ever get —
 * the heuristics in `normalize.ts` exist because most sources have none — so it would be a waste
 * to flatten it to text and guess it back.
 *
 * Browser-only: `DOMParser`. Everything else in `lib/ingest` runs under node so the unit suite can
 * reach it; this one is covered end-to-end instead.
 */
import { newId } from './id';
import type { ExtractedBlock, PageRef } from './types';

const HEADINGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

export function htmlToBlocks(html: string, pageRef: PageRef): ExtractedBlock[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks: ExtractedBlock[] = [];

  const push = (kind: ExtractedBlock['kind'], text: string, extra?: Partial<ExtractedBlock>) => {
    if (!text.trim()) return;
    blocks.push({ id: newId('blk'), kind, text, pageRef, ...extra });
  };

  for (const node of [...doc.body.children]) {
    const tag = node.tagName;

    if (HEADINGS.has(tag)) {
      const level = Number(tag[1]);
      push('heading', `${'#'.repeat(level)} ${inlineText(node)}`, { level });
      continue;
    }

    if (tag === 'UL' || tag === 'OL') {
      const ordered = tag === 'OL';
      const items = [...node.querySelectorAll(':scope > li')].map(
        (li, index) => `${ordered ? `${index + 1}.` : '-'} ${inlineText(li)}`,
      );
      push('list', items.join('\n'));
      continue;
    }

    if (tag === 'TABLE') {
      const rows = [...node.querySelectorAll('tr')].map(
        (row) => `| ${[...row.children].map((cell) => inlineText(cell)).join(' | ')} |`,
      );
      push('table', rows.join('\n'));
      continue;
    }

    // A paragraph can hold an image, text, or both, and the order matters — an image dropped to
    // the end of the document loses the thing it was next to.
    for (const part of splitOnImages(node)) {
      if (part.kind === 'image')
        push('image', `[IMAGE: ${part.assetId}]`, { assetId: part.assetId });
      else push('paragraph', part.text);
    }
  }

  return blocks;
}

type Part = { kind: 'text'; text: string } | { kind: 'image'; assetId: string };

/** Walks a block element, emitting its text and each `lumen-asset:` image in document order. */
function splitOnImages(element: Element): Part[] {
  const parts: Part[] = [];
  let buffer = '';

  const flush = () => {
    if (buffer.trim()) parts.push({ kind: 'text', text: collapse(buffer) });
    buffer = '';
  };

  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      buffer += node.nodeValue ?? '';
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    if (el.tagName === 'IMG') {
      const src = el.getAttribute('src') ?? '';
      const assetId = src.startsWith('lumen-asset:') ? src.slice('lumen-asset:'.length) : null;
      if (assetId) {
        flush();
        parts.push({ kind: 'image', assetId });
      }
      return;
    }
    if (el.tagName === 'BR') {
      buffer += '\n';
      return;
    }
    for (const child of el.childNodes) walk(child);
  };

  walk(element);
  flush();
  return parts;
}

function inlineText(element: Element): string {
  return collapse(element.textContent ?? '');
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
