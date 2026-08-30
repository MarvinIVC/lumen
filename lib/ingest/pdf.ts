/**
 * `.pdf` via pdf.js (02-ARCHITECTURE.md §2).
 *
 * Two kinds of PDF arrive and they need opposite things. A PDF exported from slides or a word
 * processor has a text layer, and reading it is free, exact, and instant. A PDF that is a photo of
 * a worksheet has none, and the only way through is the vision model — which costs a credit, so
 * the student decides, not us (01-PRODUCT.md §2 step 3).
 *
 * Telling them apart is the whole job here. A page under `MIN_PAGE_TEXT_CHARS` is treated as a
 * scan: it is flagged `needsOCR` and rendered to a thumbnail, because a student cannot decide
 * whether page 7 is worth a credit without seeing page 7.
 */
import { canvasToBlob } from './image';
import { newId } from './id';
import { loadPdfJs } from './loaders';
import { MAX_PAGES, MIN_PAGE_TEXT_CHARS, MIN_USEFUL_CHARS } from './limits';
import { countChars, stripRepeatedEdges, toBlocks } from './normalize';
import type { RawPage } from './normalize';
import { IngestError } from './types';
import type { ExtractedAsset, ExtractedBlock, ExtractedDoc, Parser, ParseContext } from './types';
import type { PDFPageProxy } from 'pdfjs-dist';

export const PARSER_VERSION = 'pdf@1';

/** Wide enough to read a heading on a phone, small enough that 60 of them are not a problem. */
const THUMBNAIL_WIDTH = 620;

export const pdfParser: Parser = {
  id: 'pdf',
  extensions: ['.pdf'],
  async parse(file: File, context: ParseContext): Promise<ExtractedDoc> {
    const pdfjs = await loadPdfJs();
    context.onProgress?.(0.05);

    const data = new Uint8Array(await file.arrayBuffer());
    const task = pdfjs.getDocument({
      data,
      ...(context.password ? { password: context.password } : {}),
    });

    let pdf;
    try {
      pdf = await task.promise;
    } catch (error) {
      throw translateLoadError(error, file.name, Boolean(context.password));
    }

    try {
      if (pdf.numPages > MAX_PAGES) {
        throw new IngestError('too-many-pages', `${file.name} is ${pdf.numPages} pages.`, false);
      }

      const rawPages: RawPage[] = [];
      const scans: { pageNumber: number; pageRef: RawPage['pageRef'] }[] = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        context.signal?.throwIfAborted();
        const pageRef = {
          sourceId: context.sourceId,
          page: pageNumber,
          label: `${file.name} · p${pageNumber}`,
        };
        const page = await pdf.getPage(pageNumber);
        const text = await readTextLayer(page);

        if (text.trim().length < MIN_PAGE_TEXT_CHARS) scans.push({ pageNumber, pageRef });
        else rawPages.push({ pageRef, text });

        // Text extraction is the fast half; rasterising the scans is the slow one.
        context.onProgress?.(0.05 + 0.55 * (pageNumber / pdf.numPages));
      }

      const blocks: ExtractedBlock[] = [];
      const assets: ExtractedAsset[] = [];
      const stripped = stripRepeatedEdges(rawPages);
      const byPage = new Map(stripped.map((page) => [page.pageRef.page ?? 0, page]));

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const scan = scans.find((entry) => entry.pageNumber === pageNumber);
        if (scan) {
          context.signal?.throwIfAborted();
          const page = await pdf.getPage(pageNumber);
          const asset = await renderThumbnail(page, context.sourceId, scan.pageRef);
          if (asset) assets.push(asset);
          blocks.push({
            id: newId('blk'),
            kind: 'image',
            text: asset ? `[IMAGE: ${asset.id}]` : `[IMAGE: page ${pageNumber}]`,
            pageRef: scan.pageRef,
            needsOCR: true,
            ...(asset ? { assetId: asset.id } : {}),
          });
          context.onProgress?.(0.6 + 0.4 * (pageNumber / pdf.numPages));
          continue;
        }
        const raw = byPage.get(pageNumber);
        if (raw) blocks.push(...toBlocks(raw.text, raw.pageRef));
      }

      const charCount = countChars(blocks.filter((block) => block.kind !== 'image'));
      if (charCount < MIN_USEFUL_CHARS && scans.length === 0) {
        throw new IngestError('empty', `We found no text in ${file.name}.`);
      }

      context.onProgress?.(1);
      return {
        blocks,
        assets,
        meta: {
          charCount,
          pageCount: pdf.numPages,
          sourceFiles: [
            {
              id: context.sourceId,
              name: file.name,
              size: file.size,
              mime: file.type || 'application/pdf',
              kind: 'pdf',
              pageCount: pdf.numPages,
              charCount,
              parserVersion: PARSER_VERSION,
            },
          ],
        },
      };
    } finally {
      // Releases the worker's copy of the file. The loading task owns it, not the document proxy.
      await task.destroy();
    }
  },
};

/** pdf.js reports "no password" and "wrong password" the same way apart from a numeric code. */
function translateLoadError(error: unknown, name: string, hadPassword: boolean): IngestError {
  const kind = (error as { name?: string } | null)?.name;
  if (kind === 'PasswordException') {
    return new IngestError(
      'encrypted',
      hadPassword
        ? 'That password did not open it. Try again, or paste the text instead.'
        : `${name} is password-protected.`,
    );
  }
  if (kind === 'InvalidPDFException') {
    return new IngestError('corrupt', `${name} is not a PDF we can read — it may be damaged.`);
  }
  return new IngestError('corrupt', `We could not open ${name}.`);
}

interface TextItemish {
  str?: string;
  hasEOL?: boolean;
}

/**
 * Joins the text items back into lines. pdf.js gives one item per run of same-styled glyphs, so a
 * single line of notes can arrive as eight items and a paragraph break is only visible in `hasEOL`.
 */
async function readTextLayer(page: PDFPageProxy) {
  const content = await page.getTextContent();
  let text = '';
  for (const item of content.items as TextItemish[]) {
    if (typeof item.str !== 'string') continue;
    text += item.str;
    if (item.hasEOL) text += '\n';
  }
  return text;
}

/** The picture of the page the student judges before spending a credit on it. */
async function renderThumbnail(
  page: PDFPageProxy,
  sourceId: string,
  pageRef: ExtractedAsset['pageRef'],
): Promise<ExtractedAsset | null> {
  try {
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, THUMBNAIL_WIDTH / base.width);
    const viewport = page.getViewport({ scale });
    const width = Math.round(viewport.width);
    const height = Math.round(viewport.height);

    // pdf.js renders into a real canvas element; an OffscreenCanvas is not in its accepted type.
    const canvas = Object.assign(document.createElement('canvas'), { width, height });
    const canvasContext = canvas.getContext('2d');
    if (!canvasContext) return null;
    await page.render({ canvas, canvasContext, viewport }).promise;

    const blob = await canvasToBlob(canvas, 'image/webp', 0.82);
    return {
      id: newId('ast'),
      sourceId,
      kind: 'page-thumb',
      mime: blob.type || 'image/webp',
      blob,
      width,
      height,
      ...(pageRef ? { pageRef } : {}),
    };
  } catch {
    // A page that will not rasterise still gets its OCR button; it just has no preview.
    return null;
  }
}
