'use client';

/**
 * The two formats that leave as a file rather than as a print dialog (06 §2).
 *
 * Markdown ships as a zip because it is not one file: it is the note plus every figure it refers
 * to, and a Markdown file whose images are all broken links is not portable, which was the entire
 * reason to offer it.
 */
import type { NoteDocument } from '@/lib/ai/schema';
import type { LocalNote } from '@/lib/store/types';

import { ankiGuide, toAnkiCsv } from './anki';
import { downloadBlob, safeFilename } from './download';
import { assetPath, toMarkdownDocument } from './markdown';
import { buildExportModel, needsRaster, visualBlocks } from './model';
import { rasterizeAll } from './raster';
import type { ExportFormat, ExportOptions, ExportModel, RasterAsset } from './types';
import { figureAssets } from './figures';

export interface ExportProgress {
  (stage: 'rendering' | 'packing', done: number, total: number): void;
}

export async function exportMarkdown(
  note: LocalNote,
  doc: NoteDocument,
  options: ExportOptions,
  onProgress?: ExportProgress,
): Promise<void> {
  const model = modelFor(note, doc, options);
  const rasters = await collectRasters(model, note, 'markdown', (done, total) =>
    onProgress?.('rendering', done, total),
  );

  const { strToU8, zipSync } = await import('fflate');
  const files: Record<string, Uint8Array> = {
    'note.md': strToU8(toMarkdownDocument(model, rasters)),
  };
  for (const [blockId, raster] of rasters) {
    files[assetPath(blockId)] = new Uint8Array(raster.png);
  }
  onProgress?.('packing', 1, 1);

  const bytes = zipSync(files, { level: 6 });
  const name = safeFilename(model.title);
  downloadBlob(
    `${name}.zip`,
    new Blob([bytes as unknown as ArrayBuffer], { type: 'application/zip' }),
  );
}

/**
 * Anki leaves as a zip too, for one reason: the guide.
 *
 * A bare `.txt` in a downloads folder is a file a student has to be told what to do with, and the
 * telling would have to live in the UI, where they are not standing when they finally get round
 * to importing it. Two files in a folder answer the question where it gets asked.
 */
export async function exportAnki(
  note: LocalNote,
  doc: NoteDocument,
  options: ExportOptions,
  onProgress?: ExportProgress,
): Promise<void> {
  // The cards *are* this format, so "notes only" cannot mean "no cards" here — it would produce an
  // empty file. `anki.ts` says the same thing in its header; this is where it is enforced.
  const model = modelFor(note, doc, { ...options, includeStudyTools: true });
  onProgress?.('packing', 0, 1);

  const { strToU8, zipSync } = await import('fflate');
  const bytes = zipSync(
    {
      'flashcards.txt': strToU8(toAnkiCsv(model)),
      'how-to-import.md': strToU8(ankiGuide(model)),
    },
    { level: 6 },
  );
  onProgress?.('packing', 1, 1);

  downloadBlob(
    `${safeFilename(model.title)}-anki.zip`,
    new Blob([bytes as unknown as ArrayBuffer], { type: 'application/zip' }),
  );
}

/**
 * Every picture the document needs: the drawn ones rasterised off the page, the photographed ones
 * read back out of the asset store.
 */
export async function collectRasters(
  model: ExportModel,
  note: LocalNote,
  format: ExportFormat,
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, RasterAsset>> {
  const blocks = visualBlocks(model).filter((row) => needsRaster(row, format));
  const drawn = blocks.filter((row) => row.block.type !== 'figure');
  const rasters = await rasterizeAll(drawn, onProgress);
  for (const [blockId, asset] of await figureAssets(blocks, note)) rasters.set(blockId, asset);
  return rasters;
}

/**
 * The model for the document the student is actually looking at.
 *
 * **`doc` is the workspace's live document, not `note.generated`, and the difference is not
 * cosmetic.** `note.generated` is the raw generation as it was stored; the workspace renders it
 * after `migrateNoteDocument`, which is what mints the block ids. Every figure in every format is
 * looked up by block id — `raster.ts` finds a diagram's SVG with `getElementById(block.id)` —
 * so exporting the stored copy asks for elements whose ids are `undefined`, finds none of them,
 * and produces a document with no pictures at all. Silently: each figure degrades to its caption,
 * which is exactly what an absent diagram is supposed to look like.
 *
 * It is also the honest document. A student who has edited their note expects the edits in the
 * file, and `note.generated` is what the model wrote before they touched it.
 */
export function modelFor(note: LocalNote, doc: NoteDocument, options: ExportOptions): ExportModel {
  return buildExportModel(doc, options, {
    model: note.model ?? null,
    generatedAt: note.generatedAt ?? note.updatedAt,
  });
}
