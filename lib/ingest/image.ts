/**
 * Photos, screenshots and scanned pages (01-PRODUCT.md §2 step 2).
 *
 * An image carries no text we can read locally, so this parser's whole job is to get the pixels
 * into a shape the vision model can read cheaply and the review screen can show: decoded (HEIC
 * included, which is what an iPhone hands us), downscaled to `MAX_IMAGE_EDGE`, and queued as
 * `needsOCR`. No recognition happens here and nothing is sent anywhere — OCR is a phase-04 call
 * the student makes deliberately, one credit at a time.
 *
 * The downscale is not only about bytes. A 12-megapixel phone photo costs several times as many
 * vision tokens as the same page at 2000px and reads no better, so the cap is a cost control as
 * much as a transfer one (02-ARCHITECTURE.md §7).
 */
import { loadHeic2Any } from './loaders';
import { MAX_IMAGE_EDGE } from './limits';
import { newId } from './id';
import { IngestError } from './types';
import type { ExtractedAsset, ExtractedDoc, Parser, ParseContext } from './types';

export const PARSER_VERSION = 'image@1';

const HEIC_EXTENSIONS = ['.heic', '.heif'];

export interface RasterImage {
  blob: Blob;
  width: number;
  height: number;
}

function isHeic(file: { name: string; type: string }): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    HEIC_EXTENSIONS.some((extension) => name.endsWith(extension))
  );
}

/** Safari can decode HEIC natively; every other browser needs the wasm. Try the cheap path first. */
async function toDecodableBlob(file: File): Promise<Blob> {
  if (!isHeic(file)) return file;
  try {
    await createImageBitmap(file).then((bitmap) => bitmap.close());
    return file;
  } catch {
    const heic2any = await loadHeic2Any();
    const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    return Array.isArray(converted) ? (converted[0] as Blob) : converted;
  }
}

/**
 * Decodes, and downscales when the longest edge is over the cap. Encodes to WebP where the
 * browser has it and JPEG otherwise; either way the source blob is released.
 */
export async function normaliseImage(input: Blob, maxEdge = MAX_IMAGE_EDGE): Promise<RasterImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(input);
  } catch {
    throw new IngestError('corrupt', 'We could not open that image.');
  }

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  if (scale === 1 && input.type && input.type !== 'image/heic' && input.type !== 'image/heif') {
    bitmap.close();
    return { blob: input, width, height };
  }

  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (!context) {
    bitmap.close();
    throw new IngestError('corrupt', 'This browser could not process that image.');
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await canvasToBlob(canvas);
  return { blob, width, height };
}

function createCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function encode(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type: string,
  quality: number,
): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new IngestError('corrupt', 'Could not read image.')),
      type,
      quality,
    );
  });
}

/**
 * Encodes a photo or a scanned page, in the smallest format the browser actually supports.
 *
 * A browser asked for a format it cannot encode does not fail — it silently returns PNG. Safari
 * has no WebP encoder, so a 5 MB iPhone photo came back out of the downscale at **9.9 MB**: the
 * step meant to cut the upload nearly doubled it, on exactly the devices that take the photos.
 * The returned blob's own `type` is the only reliable signal, so it is checked rather than
 * trusted, and JPEG is the fallback — neither a photo nor a scan needs an alpha channel, and PNG
 * is the wrong codec for either.
 */
export async function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type = 'image/webp',
  quality = 0.9,
): Promise<Blob> {
  const encoded = await encode(canvas, type, quality);
  if (encoded.type === type || type === 'image/jpeg') return encoded;
  return encode(canvas, 'image/jpeg', quality);
}

export const imageParser: Parser = {
  id: 'image',
  extensions: ['.png', '.jpg', '.jpeg', '.heic', '.heif', '.webp', '.gif'],
  async parse(file: File, context: ParseContext): Promise<ExtractedDoc> {
    context.onProgress?.(0.15);
    const decodable = await toDecodableBlob(file);
    context.onProgress?.(0.55);
    const raster = await normaliseImage(decodable);
    context.onProgress?.(0.9);

    const pageRef = { sourceId: context.sourceId, label: file.name };
    const asset: ExtractedAsset = {
      id: newId('ast'),
      sourceId: context.sourceId,
      kind: 'photo',
      mime: raster.blob.type || 'image/webp',
      blob: raster.blob,
      width: raster.width,
      height: raster.height,
      pageRef,
    };

    context.onProgress?.(1);
    return {
      blocks: [
        {
          id: newId('blk'),
          kind: 'image',
          text: `[IMAGE: ${asset.id}]`,
          pageRef,
          needsOCR: true,
          assetId: asset.id,
        },
      ],
      assets: [asset],
      meta: {
        charCount: 0,
        pageCount: 1,
        sourceFiles: [
          {
            id: context.sourceId,
            name: file.name,
            size: file.size,
            mime: file.type || 'image/*',
            kind: 'image',
            pageCount: 1,
            charCount: 0,
            parserVersion: PARSER_VERSION,
          },
        ],
      },
    };
  },
};
