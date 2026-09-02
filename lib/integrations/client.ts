'use client';

/**
 * The browser half of the integrations (06 §3).
 *
 * Everything goes through `/api/integrations/*` so the Supabase token stays server-side —
 * phase-06's boundary, unchanged. The mapping and the pictures are assembled here rather than in
 * the function, because the pictures only exist here: a diagram is rasterised off the rendered
 * page, and re-rendering Mermaid inside a Deno function is not a thing anyone should attempt.
 */
import { collectRasters, modelFor } from '@/lib/export/bundle';
import { toNotionBlocks } from '@/lib/integrations/notion-blocks';
import { safeFilename } from '@/lib/export/download';
import type { ExportOptions } from '@/lib/export/types';
import type { NoteDocument } from '@/lib/ai/schema';
import type { LocalNote } from '@/lib/store/types';

export interface NotionTarget {
  id: string;
  type: 'database_id' | 'page_id';
  title: string;
}

export interface IntegrationStatus {
  connected: boolean;
  revoked: boolean;
  accountLabel: string | null;
  /** Where this note's course last went, if anywhere. */
  target: string | null;
}

export class ReauthNeeded extends Error {}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/integrations/${path}`, init);
  if (response.status === 409) throw new ReauthNeeded();
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'That did not work.');
  }
  return (await response.json()) as T;
}

export function connectHref(provider: 'notion' | 'drive', next: string): string {
  return `/api/integrations/start?provider=${provider}&next=${encodeURIComponent(next)}`;
}

export async function notionTargets(): Promise<{
  targets: NotionTarget[];
  workspace: string | null;
}> {
  return call('notion-search', { method: 'POST' });
}

/** Base64 without the data-URL prefix, which is what the function expects. */
function toBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = '';
  for (let index = 0; index < view.length; index += 1) binary += String.fromCharCode(view[index]!);
  return btoa(binary);
}

export interface PushResult {
  url: string;
  updated: boolean;
  blocks: number;
}

export async function pushToNotion(
  note: LocalNote,
  doc: NoteDocument,
  options: ExportOptions,
  target: { type: 'database_id' | 'page_id'; id: string } | null,
  onProgress?: (stage: 'rendering' | 'pushing') => void,
): Promise<PushResult> {
  const model = modelFor(note, doc, options);

  onProgress?.('rendering');
  // 'docx' rather than 'markdown': Notion cannot draw a Mermaid fence, so it needs the picture.
  const rasters = await collectRasters(model, note, 'docx');

  const backlink = `${window.location.origin}/app/note/${note.id}`;
  const { blocks, images } = toNotionBlocks(model, backlink);

  onProgress?.('pushing');
  return call<PushResult>('notion-push', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      noteLocalId: note.localId,
      title: model.title,
      blocks,
      images: images
        .map((image) => {
          const raster = rasters.get(image.blockId);
          return raster ? { blockId: image.blockId, base64: toBase64(raster.png) } : null;
        })
        .filter((image): image is { blockId: string; base64: string } => image !== null),
      ...(target ? { target } : {}),
      courseKey: note.context.course || 'Unsorted',
    }),
  });
}

export async function pushToDrive(
  note: LocalNote,
  doc: NoteDocument,
  options: ExportOptions,
  onProgress?: (stage: 'rendering' | 'pushing') => void,
): Promise<{ url: string; folder: string }> {
  onProgress?.('rendering');
  // The same Worker that makes the download, so the file in Drive and the file on disk are the
  // same bytes rather than two implementations of "the Word export".
  const { buildDocxBlob } = await import('@/lib/export/docx');
  const blob = await buildDocxBlob(note, doc, options);

  onProgress?.('pushing');
  const form = new FormData();
  form.set('noteLocalId', note.localId);
  form.set('filename', `${safeFilename(doc.title)}.docx`);
  form.set('course', note.context.course ?? '');
  form.set('file', new File([blob], 'study-guide.docx', { type: blob.type }));

  return call<{ url: string; folder: string }>('drive-push', { method: 'POST', body: form });
}
