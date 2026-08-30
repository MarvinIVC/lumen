/**
 * The ingestion entry point (01-PRODUCT.md §2 step 2).
 *
 * Everything here runs in the browser. Nothing is uploaded, and the per-file progress rows say
 * "reading" rather than "uploading" because that is what is happening — the privacy promise is
 * only as good as the smallest wording in the product.
 */
import { docxParser } from './docx';
import { imageParser } from './image';
import { pdfParser } from './pdf';
import { newId } from './id';
import { textParser } from './text';
import { CAP_MESSAGES, MAX_BYTES, extensionOf, isAccepted } from './limits';
import { IngestError } from './types';
import type { ExtractedDoc, Parser, ParseContext, SourceKind } from './types';

export * from './types';
export {
  ACCEPTED_EXTENSIONS,
  ACCEPTED_SUMMARY,
  ACCEPT_ATTRIBUTE,
  CAP_MESSAGES,
  MAX_BYTES,
  MAX_CHARS,
  MAX_PAGES,
  SOFT_PAGE_LIMIT,
  extensionOf,
  formatBytes,
  isAccepted,
} from './limits';
export { capBlocks, emptyDoc, mergeDocs, recount, splitDoc } from './merge';
export { parsePaste } from './text';
export { newId } from './id';

const PARSERS: Parser[] = [docxParser, pdfParser, textParser, imageParser];

export function parserFor(fileName: string): Parser | null {
  const extension = extensionOf(fileName);
  return PARSERS.find((parser) => parser.extensions.includes(extension)) ?? null;
}

/** What the dropzone rows show as an icon, before anything has been parsed. */
export function kindOf(fileName: string): 'document' | 'image' {
  return parserFor(fileName)?.id === 'image' ? 'image' : 'document';
}

export function sourceKindOf(fileName: string): SourceKind | null {
  return parserFor(fileName)?.id ?? null;
}

/**
 * The checks that can be made without reading the file. Run at drop time so a 200 MB video is
 * refused in the same frame it lands, rather than after a spinner.
 */
export function precheck(file: File): IngestError | null {
  if (!isAccepted(file.name)) {
    return new IngestError('unsupported', CAP_MESSAGES.unsupported(file.name));
  }
  if (file.size > MAX_BYTES) {
    return new IngestError('too-large', CAP_MESSAGES.tooLarge(file.name, file.size), false);
  }
  return null;
}

export interface ParseFileOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  password?: string;
  /** Reuse an id across a retry so blocks and assets keep pointing at the same source. */
  sourceId?: string;
}

/**
 * Parses one file. Throws `IngestError` for anything the student can act on, and nothing else —
 * an unexpected failure is re-thrown so it reaches Sentry rather than being dressed up as advice.
 */
export async function parseFile(file: File, options: ParseFileOptions = {}): Promise<ExtractedDoc> {
  const failed = precheck(file);
  if (failed) throw failed;

  const parser = parserFor(file.name);
  if (!parser) throw new IngestError('unsupported', CAP_MESSAGES.unsupported(file.name));

  const context: ParseContext = {
    sourceId: options.sourceId ?? newId('src'),
    ...(options.onProgress ? { onProgress: options.onProgress } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.password ? { password: options.password } : {}),
  };

  return parser.parse(file, context);
}
