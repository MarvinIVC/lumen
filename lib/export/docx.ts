'use client';

/**
 * The main-thread half of the Word export (06 §2).
 *
 * Rasterise here, pack there. The split is not a preference: `createImageBitmap` on an SVG blob is
 * unsupported in Workers on WebKit and Firefox, so the pictures have to be drawn on the main
 * thread, and packing the zip is the part that is actually slow enough to be worth moving off it.
 */
import type { LocalNote } from '@/lib/store/types';

import { collectRasters, modelFor } from './bundle';
import { downloadBlob, safeFilename } from './download';
import type { DocxRequest, DocxResponse } from './docx.worker';
import type { ExportOptions } from './types';
import type { ExportProgress } from './bundle';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export async function exportDocx(
  note: LocalNote,
  options: ExportOptions,
  onProgress?: ExportProgress,
): Promise<void> {
  const model = modelFor(note, options);
  const rasters = await collectRasters(model, note, (done, total) =>
    onProgress?.('rendering', done, total),
  );

  onProgress?.('packing', 0, 1);
  const bytes = await pack({ model, rasters: [...rasters.values()] });
  onProgress?.('packing', 1, 1);

  downloadBlob(`${safeFilename(model.title)}.docx`, new Blob([bytes], { type: DOCX_MIME }));
}

/**
 * Hands the request to the Worker and waits for the finished bytes.
 *
 * The Worker is created per export and terminated after: it holds the whole document plus every
 * picture, and keeping one alive between exports keeps all of that resident for a student who may
 * never press the button again.
 */
function pack(request: DocxRequest): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./docx.worker.ts', import.meta.url), { type: 'module' });

    worker.onmessage = (event: MessageEvent<DocxResponse>) => {
      worker.terminate();
      if (event.data.ok) resolve(event.data.bytes);
      else reject(new Error(event.data.error));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'the Word export failed to start'));
    };

    // The PNG buffers are transferred, not copied — a note with six diagrams is several megabytes
    // and structured-cloning it twice is a visible pause on the machines this has to be quick on.
    worker.postMessage(
      request,
      request.rasters.map((raster) => raster.png),
    );
  });
}
