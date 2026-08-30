/**
 * Reading and writing drafts (phase-03 DoD: "refresh at any point — nothing lost").
 *
 * The autosave contract is deliberately simple: the store owns the whole draft, `saveDraft`
 * replaces it, and `updatedAt` is set here so no caller can forget. There is no partial write and
 * no merge, because two tabs editing one draft is not a case worth the complexity — the second
 * tab wins, which is what a student who opened a second tab expects.
 */
import { getDb } from './db';
import type { LocalDraft, LocalNote, StoredAsset, StoredDoc } from './types';
import type { ExtractedAsset, ExtractedDoc } from '@/lib/ingest/types';

export async function saveDraft(draft: LocalDraft): Promise<void> {
  const db = await getDb();
  await db?.put('drafts', { ...draft, updatedAt: Date.now() });
}

export async function loadDraft(id: string): Promise<LocalDraft | null> {
  const db = await getDb();
  return (await db?.get('drafts', id)) ?? null;
}

/** Newest first — what the "resume where you left off" list on `/app` shows. */
export async function listDrafts(limit = 10): Promise<LocalDraft[]> {
  const db = await getDb();
  if (!db) return [];
  const all = await db.getAllFromIndex('drafts', 'by-updatedAt');
  return all.reverse().slice(0, limit);
}

export async function deleteDraft(id: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const tx = db.transaction(['drafts', 'assets'], 'readwrite');
  const assetIds = await tx.objectStore('assets').index('by-draft').getAllKeys(id);
  await Promise.all([
    tx.objectStore('drafts').delete(id),
    ...assetIds.map((key) => tx.objectStore('assets').delete(key)),
  ]);
  await tx.done;
}

/**
 * Persists the images of a parse.
 *
 * Never rejects. The blobs are a convenience — the review screen shows a thumbnail where it has
 * one and the OCR button where it does not — and a storage failure must not be able to fail the
 * parse that produced them. Safari in private browsing refuses IndexedDB writes outright, and it
 * is not a reason to tell a student their photo could not be read.
 */
export async function putAssets(draftId: string, assets: ExtractedAsset[]): Promise<void> {
  const db = await getDb();
  if (!db || assets.length === 0) return;
  try {
    const rows = await Promise.all(
      assets.map(async (asset) => ({
        id: asset.id,
        draftId,
        sourceId: asset.sourceId,
        kind: asset.kind,
        mime: asset.mime,
        bytes: await asset.blob.arrayBuffer(),
        width: asset.width,
        height: asset.height,
        ...(asset.alt ? { alt: asset.alt } : {}),
      })),
    );
    const tx = db.transaction('assets', 'readwrite');
    await Promise.all(rows.map((row) => tx.store.put(row satisfies StoredAsset)));
    await tx.done;
  } catch {
    // The session keeps its in-memory copy; only a reload loses the picture.
  }
}

export async function listAssets(draftId: string): Promise<StoredAsset[]> {
  const db = await getDb();
  if (!db) return [];
  return db.getAllFromIndex('assets', 'by-draft', draftId);
}

/**
 * Copies assets to a second draft, for "split into two lessons".
 *
 * Copied rather than moved or shared: the two drafts are independent from the moment they split,
 * and discarding one deletes its assets. A tail draft that pointed at the head's rows would lose
 * every scanned page the moment the student tidied up.
 */
export async function copyAssets(
  toDraftId: string,
  assetIds: string[],
  extra: ExtractedAsset[] = [],
): Promise<void> {
  const db = await getDb();
  if (!db || assetIds.length === 0) return;
  try {
    const rows = await Promise.all(assetIds.map((id) => db.get('assets', id)));
    const fromSession = new Map(extra.map((asset) => [asset.id, asset]));

    const copies: StoredAsset[] = [];
    for (const [index, row] of rows.entries()) {
      const id = assetIds[index];
      if (row) {
        copies.push({ ...row, draftId: toDraftId });
        continue;
      }
      // Parsed in this session and not yet flushed, or written under a different draft.
      const live = id ? fromSession.get(id) : undefined;
      if (!live) continue;
      copies.push({
        id: live.id,
        draftId: toDraftId,
        sourceId: live.sourceId,
        kind: live.kind,
        mime: live.mime,
        bytes: await live.blob.arrayBuffer(),
        width: live.width,
        height: live.height,
        ...(live.alt ? { alt: live.alt } : {}),
      });
    }

    const tx = db.transaction('assets', 'readwrite');
    await Promise.all(copies.map((copy) => tx.store.put(copy)));
    await tx.done;
  } catch {
    // Same reasoning as `putAssets`: a thumbnail is a convenience, not the lesson.
  }
}

export async function getAsset(id: string): Promise<StoredAsset | null> {
  const db = await getDb();
  return (await db?.get('assets', id)) ?? null;
}

/* -------------------------------------------------------------------------- *
 * Notes
 * -------------------------------------------------------------------------- */

export async function saveNote(note: LocalNote): Promise<void> {
  const db = await getDb();
  await db?.put('notes', { ...note, updatedAt: Date.now() });
}

export async function loadNote(id: string): Promise<LocalNote | null> {
  const db = await getDb();
  return (await db?.get('notes', id)) ?? null;
}

export async function listNotes(limit = 50): Promise<LocalNote[]> {
  const db = await getDb();
  if (!db) return [];
  const all = await db.getAllFromIndex('notes', 'by-updatedAt');
  return all.reverse().slice(0, limit);
}

/* -------------------------------------------------------------------------- *
 * Conversions
 * -------------------------------------------------------------------------- */

/** Splits a parsed document into the part that is persisted and the blobs that go beside it. */
export function toStoredDoc(doc: ExtractedDoc): StoredDoc {
  return { blocks: doc.blocks, meta: doc.meta };
}
