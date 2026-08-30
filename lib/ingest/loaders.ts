/**
 * The one place the heavy parsing libraries are loaded (02-ARCHITECTURE.md §8).
 *
 * mammoth, pdf.js and heic2any are together well over a megabyte, and a student who pastes their
 * notes into the textarea should download none of it. Each is behind a memoised `await import()`
 * here — the same rule and the same shape as the renderers in `lib/render`, and
 * `tests/unit/dynamic-imports.test.ts` fails on a static import or on a second loader.
 *
 * Client-only, all of it. Nothing on the server ever parses a document: parsing in the browser is
 * what makes "nothing is sent anywhere until you press the button" true (00-BRIEF.md §5).
 */
import type * as MammothNs from 'mammoth';
import type * as PdfJs from 'pdfjs-dist';
import type Heic2AnyFn from 'heic2any';

type Mammoth = typeof MammothNs;

let mammothPromise: Promise<Mammoth> | null = null;
let pdfjsPromise: Promise<typeof PdfJs> | null = null;
let heicPromise: Promise<typeof Heic2AnyFn> | null = null;

export function loadMammoth(): Promise<Mammoth> {
  mammothPromise ??= import('mammoth').then((module) => module.default ?? module);
  return mammothPromise;
}

export function loadPdfJs(): Promise<typeof PdfJs> {
  pdfjsPromise ??= import('pdfjs-dist').then((pdfjs) => {
    // pdf.js parses on a worker thread. Without one it runs on the main thread and a 40-page
    // scan freezes the tab for the whole parse — which is exactly when the progress bar it is
    // freezing was the only thing telling the student anything was happening.
    if (!pdfjs.GlobalWorkerOptions.workerPort) {
      try {
        pdfjs.GlobalWorkerOptions.workerPort = new Worker(
          new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url),
          { type: 'module' },
        );
      } catch {
        // A browser with workers disabled still parses, slowly. Better than not at all.
      }
    }
    return pdfjs;
  });
  return pdfjsPromise;
}

export function loadHeic2Any(): Promise<typeof Heic2AnyFn> {
  heicPromise ??= import('heic2any').then((module) => module.default ?? module);
  return heicPromise;
}

/** Test seam: lets a suite drop a loaded module without touching the network or the DOM. */
export function __resetLoaders(): void {
  mammothPromise = null;
  pdfjsPromise = null;
  heicPromise = null;
}
