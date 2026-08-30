/**
 * `.txt`, `.md`, `.rtf`, and the paste box (01-PRODUCT.md §2 step 2).
 *
 * The simplest path and the most common one: most students who try this product for the first
 * time paste. It gets the same normaliser as everything else so the review screen cannot tell
 * where the text came from.
 */
import { MIN_USEFUL_CHARS } from './limits';
import { newId } from './id';
import { countChars, toBlocks } from './normalize';
import { looksLikeRtf, rtfToText } from './rtf';
import { IngestError } from './types';
import type { ExtractedDoc, Parser, ParseContext } from './types';

export const PARSER_VERSION = 'text@1';

export function extractedFromText(
  text: string,
  options: { sourceId: string; name: string; size?: number; mime?: string; paste?: boolean },
): ExtractedDoc {
  const decoded = looksLikeRtf(text) ? rtfToText(text) : text;
  const pageRef = { sourceId: options.sourceId, label: options.name };
  const blocks = toBlocks(decoded, pageRef);
  const charCount = countChars(blocks);

  return {
    blocks,
    assets: [],
    meta: {
      charCount,
      pageCount: 1,
      sourceFiles: [
        {
          id: options.sourceId,
          name: options.name,
          size: options.size ?? decoded.length,
          mime: options.mime ?? 'text/plain',
          kind: options.paste ? 'paste' : 'text',
          pageCount: 1,
          charCount,
          parserVersion: PARSER_VERSION,
        },
      ],
    },
  };
}

/** The paste box. Its own source, so the review screen can label where a block came from. */
export function parsePaste(text: string, label = 'Pasted notes'): ExtractedDoc {
  return extractedFromText(text, { sourceId: newId('src'), name: label, paste: true, size: 0 });
}

export const textParser: Parser = {
  id: 'text',
  extensions: ['.txt', '.md', '.markdown', '.rtf'],
  async parse(file: File, context: ParseContext): Promise<ExtractedDoc> {
    context.onProgress?.(0.1);
    const raw = await file.text();
    context.onProgress?.(0.7);

    const doc = extractedFromText(raw, {
      sourceId: context.sourceId,
      name: file.name,
      size: file.size,
      mime: file.type || 'text/plain',
    });

    if (doc.meta.charCount < MIN_USEFUL_CHARS) {
      throw new IngestError('empty', `There is almost nothing in ${file.name}.`);
    }
    context.onProgress?.(1);
    return doc;
  },
};
