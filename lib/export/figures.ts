'use client';

/**
 * The photographed figures, read back out of the asset store and re-encoded (06 §2).
 *
 * **Everything an export embeds is a PNG, including the images that arrived as something else.**
 * Phase-03 stores a downscaled page or photo as WebP, and Word cannot open a WebP — `docx` accepts
 * png, jpg, gif and bmp, and hands an unreadable document to the student for anything else. So the
 * bytes are drawn onto a canvas and re-encoded here, once, for all four formats.
 */
import { canvasToBlob } from '@/lib/ingest/image';
import { getDb } from '@/lib/store/db';
import type { LocalNote } from '@/lib/store/types';

import type { ExportBlock, RasterAsset } from './types';

export async function figureAssets(
  blocks: ExportBlock[],
  note: LocalNote,
): Promise<Map<string, RasterAsset>> {
  const figures = blocks.filter((row) => row.block.type === 'figure');
  const out = new Map<string, RasterAsset>();
  if (!figures.length) return out;

  const db = await getDb();
  if (!db) return out;

  for (const row of figures) {
    const block = row.block;
    if (block.type !== 'figure' || !block.id) continue;
    try {
      // By primary key, not by the `by-note` index: a figure usually arrives with the draft and
      // is only re-parented to the note later, so the index can legitimately be empty here.
      const asset = await db.get('assets', block.assetId);
      if (!asset) continue;
      const png = await toPng(new Blob([asset.bytes], { type: asset.mime }));
      out.set(block.id, {
        blockId: block.id,
        png: png.bytes,
        width: png.width,
        height: png.height,
        alt: block.alt,
      });
    } catch {
      // A figure that will not decode is left out; the exporters print its caption and alt text.
    }
  }

  void note;
  return out;
}

async function toPng(blob: Blob): Promise<{ bytes: ArrayBuffer; width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2d context');
    // Flattened onto white: a transparent PNG in a Word document over a coloured table cell is
    // not what anybody drew.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    const encoded = await canvasToBlob(canvas, 'image/png');
    return { bytes: await encoded.arrayBuffer(), width: canvas.width, height: canvas.height };
  } finally {
    bitmap.close();
  }
}
