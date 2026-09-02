'use client';

/**
 * The Open Graph card for a share link, drawn in the browser (06 §4).
 *
 * **`next/og` is the tool for this and it is the one thing the Worker cannot afford.** Phase-02's
 * first preview deploy failed at 3787 KiB because `next/og` carries resvg and yoga as WebAssembly;
 * the marketing card has been a build-time PNG ever since, and a per-share card cannot be built at
 * build time. So the card is rendered here, from the same SVG phase-06 already saves as the note's
 * thumbnail — which is why that decision was recorded as "phase-07 will put the same file in an
 * export".
 *
 * 1200×630 because that is what every link unfurler crops to.
 */
import { canvasToBlob } from '@/lib/ingest/image';
import { renderThumbnail } from '@/lib/store/thumbnails';
import type { NoteDocument } from '@/lib/ai/schema';

const WIDTH = 1200;
const HEIGHT = 630;

/** The thumbnail is 800×500; drawn to fill 1200×630 it is cropped, so it is fitted and centred. */
export async function renderShareCard(doc: NoteDocument): Promise<Blob> {
  const svg = renderThumbnail(doc);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));

  try {
    const image = await load(url);
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2d context');

    // Paper in both themes, as phase-06 settled for the thumbnail: a stored artefact must not
    // carry whichever theme the person who shared it happened to be using.
    context.fillStyle = '#fbfaf6';
    context.fillRect(0, 0, WIDTH, HEIGHT);

    const scale = Math.min(WIDTH / image.width, HEIGHT / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    context.drawImage(image, (WIDTH - width) / 2, (HEIGHT - height) / 2, width, height);

    return canvasToBlob(canvas, 'image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function load(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('the share card could not be drawn'));
    image.src = url;
  });
}
