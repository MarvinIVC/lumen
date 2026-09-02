/// <reference lib="webworker" />

/**
 * The Word export, off the main thread (06 §2).
 *
 * Packing a `.docx` is building a zip of XML, and for a forty-block note with half a dozen
 * embedded pictures that is long enough on a school laptop to drop the whole UI for a second or
 * two. It is also the only place `docx` is loaded, which is what keeps ~600 KB out of the page.
 *
 * **The rasters arrive as finished PNG bytes.** They cannot be made here: rasterising an SVG means
 * decoding it as an image, and `createImageBitmap` on an SVG blob is unsupported in Workers on
 * WebKit and Firefox. The main thread draws; this thread packs.
 */
import { Packer } from 'docx';

import { buildDocxDocument } from './docx-document';
import type { ExportModel, RasterAsset } from './types';

export interface DocxRequest {
  model: ExportModel;
  rasters: RasterAsset[];
}

export type DocxResponse = { ok: true; bytes: ArrayBuffer } | { ok: false; error: string };

self.onmessage = (event: MessageEvent<DocxRequest>) => {
  void (async () => {
    try {
      const { model, rasters } = event.data;
      const document = buildDocxDocument(model, new Map(rasters.map((r) => [r.blockId, r])));
      const blob = await Packer.toBlob(document);
      const bytes = await blob.arrayBuffer();
      // Transferred rather than copied — the document is megabytes once pictures are in it.
      (self as unknown as Worker).postMessage({ ok: true, bytes } satisfies DocxResponse, [bytes]);
    } catch (error) {
      (self as unknown as Worker).postMessage({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies DocxResponse);
    }
  })();
};
