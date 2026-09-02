'use client';

/**
 * SVG → PNG, for the formats that cannot carry a vector (06 §2).
 *
 * **This runs on the main thread and cannot move into the Worker.** Rasterising an SVG means
 * decoding it as an image, and `createImageBitmap` on an SVG blob is unsupported in Workers on
 * WebKit and Firefox — it resolves in Chrome and rejects everywhere else, which is the shape of
 * bug that passes CI and fails on a student's iPhone. So the main thread draws, and the Worker is
 * handed finished PNG bytes.
 *
 * Everything on screen is already rendered by the time an export starts: the read view has drawn
 * every Mermaid diagram, structure and chart into the DOM. Re-rendering them here would mean
 * loading Mermaid and smiles-drawer a second time, so this reads what is on the page instead.
 */
import { canvasToBlob } from '@/lib/ingest/image';

import type { ExportBlock, RasterAsset } from './types';

/** Rasters are drawn at twice their layout size, so they stay sharp in Word and in a PDF. */
const SCALE = 2;

/** Anything wider than this is a page-width figure; past it the memory cost stops paying off. */
const MAX_WIDTH = 1600;

/**
 * Finds a block's rendered visual in the document.
 *
 * `NoteDocument` already gives every block wrapper `id={block.id}` so the outline rail can scroll
 * to it, and a block's SVG is whatever SVG is inside its own wrapper. Looking it up by id rather
 * than by index is what keeps this right when the reading-mode filter has hidden some of them.
 */
function svgFor(blockId: string): SVGSVGElement | null {
  return document.getElementById(blockId)?.querySelector<SVGSVGElement>('svg') ?? null;
}

/**
 * One SVG element to PNG bytes.
 *
 * The SVG is serialised with its computed geometry inlined, because a `<svg>` sized by CSS has no
 * intrinsic size once it is detached from the page — and an image with no intrinsic size draws as
 * a zero-by-zero rectangle rather than failing, which is a blank figure and no error anywhere.
 */
export async function rasterizeSvg(svg: SVGSVGElement): Promise<Omit<RasterAsset, 'blockId'>> {
  const box = svg.getBoundingClientRect();
  const width = Math.min(Math.round(box.width) || 640, MAX_WIDTH);
  const height = Math.round(box.height) || 360;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  if (!clone.getAttribute('viewBox')) {
    clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }
  // The page's palette is a set of CSS variables the detached copy cannot see, and an export is a
  // stored artefact rather than a view — phase-06 settled that a saved file is paper in both
  // themes. So the copy is drawn on white with the ink it resolved to on screen.
  inlineColours(svg, clone);

  const source = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));

  try {
    const image = await load(url);
    const canvas = document.createElement('canvas');
    canvas.width = width * SCALE;
    canvas.height = height * SCALE;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2d context');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await canvasToBlob(canvas, 'image/png');
    return { png: await blob.arrayBuffer(), width: canvas.width, height: canvas.height, alt: '' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Copies the resolved `fill` and `stroke` of every element onto the detached copy.
 *
 * The rendered diagrams paint themselves with `currentColor` and with the design tokens, both of
 * which are CSS custom properties defined on the page. Serialising the SVG takes it away from that
 * stylesheet, so without this every diagram rasterises as black-on-black or as nothing at all.
 */
function inlineColours(live: SVGSVGElement, clone: SVGSVGElement): void {
  const from = [live, ...live.querySelectorAll('*')];
  const to = [clone, ...clone.querySelectorAll('*')];

  from.forEach((element, index) => {
    const target = to[index] as SVGElement | undefined;
    if (!target) return;
    const computed = getComputedStyle(element);
    for (const property of [
      'fill',
      'stroke',
      'stroke-width',
      'font-family',
      'font-size',
    ] as const) {
      const value = computed.getPropertyValue(property);
      if (value && value !== 'none') target.setAttribute(property, value);
    }
  });
}

function load(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('svg decode failed'));
    image.src = url;
  });
}

/**
 * Every visual in the model, as PNG bytes, keyed by block id.
 *
 * A visual that fails to rasterise is left out rather than throwing: the exporters all render a
 * caption and the alt text in its place, which is a worse figure but a complete document. Losing
 * the whole export because one Mermaid diagram would not serialise is the wrong trade.
 */
export async function rasterizeAll(
  blocks: ExportBlock[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, RasterAsset>> {
  const rasters = new Map<string, RasterAsset>();
  let done = 0;

  for (const row of blocks) {
    const id = row.block.id;
    const svg = id ? svgFor(id) : null;
    if (id && svg) {
      try {
        const raster = await rasterizeSvg(svg);
        const alt = 'alt' in row.block ? row.block.alt : '';
        rasters.set(id, { ...raster, blockId: id, alt });
      } catch {
        // Deliberately swallowed — see above.
      }
    }
    onProgress?.((done += 1), blocks.length);
  }

  return rasters;
}
