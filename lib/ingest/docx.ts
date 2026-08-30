/**
 * `.docx` via mammoth (02-ARCHITECTURE.md §2).
 *
 * Word is the format this project started from — the fixture is a transcription of a real
 * `AP Chem Notes.docx` — so it gets the most faithful treatment of any source: mammoth converts
 * the document's own semantics to HTML, `htmlToBlocks` reads that structure back out, and no
 * heuristic has to guess what a heading is.
 *
 * Embedded images come out as assets with a positional placeholder rather than being dropped.
 * A diagram the student drew in Word is often the only thing on the page that says what the notes
 * are about, and it belongs where it was.
 */
import { htmlToBlocks } from './html-blocks';
import { newId } from './id';
import { normaliseImage } from './image';
import { loadMammoth } from './loaders';
import { MIN_USEFUL_CHARS } from './limits';
import { countChars } from './normalize';
import { IngestError } from './types';
import type { ExtractedAsset, ExtractedDoc, Parser, ParseContext } from './types';

export const PARSER_VERSION = 'docx@1';

/** A CFB container: either a pre-2007 `.doc` or an encrypted `.docx`. Both open the same way. */
const CFB_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0];

async function looksLikeCfb(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return CFB_SIGNATURE.every((byte, index) => head[index] === byte);
}

export const docxParser: Parser = {
  id: 'docx',
  extensions: ['.docx'],
  async parse(file: File, context: ParseContext): Promise<ExtractedDoc> {
    context.onProgress?.(0.05);

    if (await looksLikeCfb(file)) {
      throw new IngestError(
        'encrypted',
        `${file.name} is either password-protected or saved in the older .doc format. ` +
          `Open it in Word and "Save as" .docx, or paste the text in.`,
      );
    }

    const mammoth = await loadMammoth();
    context.onProgress?.(0.2);

    const arrayBuffer = await file.arrayBuffer();
    const assets: ExtractedAsset[] = [];
    const pageRef = { sourceId: context.sourceId, label: file.name };

    const convertImage = mammoth.images.imgElement(async (image) => {
      try {
        // `altText` is on mammoth's image at runtime but missing from its .d.ts.
        const altText = (image as { altText?: string }).altText;
        const buffer = await image.readAsArrayBuffer();
        const raster = await normaliseImage(new Blob([buffer], { type: image.contentType }));
        const asset: ExtractedAsset = {
          id: newId('ast'),
          sourceId: context.sourceId,
          kind: 'embedded',
          mime: raster.blob.type || image.contentType,
          blob: raster.blob,
          width: raster.width,
          height: raster.height,
          ...(altText ? { alt: altText } : {}),
          pageRef,
        };
        assets.push(asset);
        return { src: `lumen-asset:${asset.id}`, alt: altText ?? '' };
      } catch {
        // One unreadable image must not cost the student the other nineteen pages.
        return { src: '' };
      }
    });

    let html: string;
    try {
      ({ value: html } = await mammoth.convertToHtml({ arrayBuffer }, { convertImage }));
    } catch {
      throw new IngestError('corrupt', `We could not open ${file.name}.`);
    }
    context.onProgress?.(0.8);

    const blocks = htmlToBlocks(html, pageRef);
    const charCount = countChars(blocks.filter((block) => block.kind !== 'image'));

    if (charCount < MIN_USEFUL_CHARS && assets.length === 0) {
      throw new IngestError('empty', `There is almost no text in ${file.name}.`);
    }

    context.onProgress?.(1);
    return {
      blocks,
      assets,
      meta: {
        charCount,
        pageCount: 1,
        sourceFiles: [
          {
            id: context.sourceId,
            name: file.name,
            size: file.size,
            mime:
              file.type ||
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            kind: 'docx',
            pageCount: 1,
            charCount,
            parserVersion: PARSER_VERSION,
          },
        ],
      },
    };
  },
};
