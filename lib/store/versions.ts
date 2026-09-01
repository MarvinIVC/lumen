/**
 * Version history (phase-05 §13).
 *
 * A snapshot on every generation and regeneration, and one every few minutes of editing. The point
 * is not source control — a student does not want a commit graph of their chemistry notes — it is
 * that "I accepted all, then realised I wanted my own wording back" and "the regenerate made it
 * worse" both have an answer that is not "start again".
 *
 * Two rules make it small enough to live in IndexedDB beside everything else:
 *
 *   Snapshots are deduplicated against the newest one. Autosave fires on a debounce, the periodic
 *   snapshot fires on a timer, and the two coincide constantly; without this a note left open in a
 *   background tab would collect an identical copy of itself every five minutes all afternoon.
 *
 *   Pruning keeps every `generated` and `regenerated` snapshot and trims the `edit` ones to the
 *   most recent `MAX_EDIT_VERSIONS`. Losing an intermediate edit costs a student one undo; losing
 *   the model's own output costs them the only copy of it.
 */
import { getDb } from './db';
import type { NoteDocument } from '@/lib/ai/schema';
import type { NoteVersion, VersionReason } from './types';

/** How many periodic edit snapshots to keep per note. Generation snapshots are never pruned. */
export const MAX_EDIT_VERSIONS = 20;

/** How long a note must have been edited before another periodic snapshot is worth taking. */
export const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;

function versionId(noteId: string, createdAt: number): string {
  return `${noteId}:${createdAt.toString(36)}`;
}

/**
 * Records a snapshot. Resolves to the version written, or null when nothing needed writing.
 *
 * Never throws, for the same reason `putAssets` does not: history is a safety net, and a browser
 * that refuses to store it must not be able to fail the edit the student was making.
 */
export async function snapshot(
  noteId: string,
  doc: NoteDocument,
  reason: VersionReason,
  label: string,
): Promise<NoteVersion | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const existing = await listVersions(noteId);
    const newest = existing[0];
    // An identical document is not a version of it.
    if (newest && JSON.stringify(newest.doc) === JSON.stringify(doc)) return null;

    let createdAt = Date.now();
    // Two snapshots inside the same millisecond — a regenerate applied by a test, or a restore
    // that snapshots the current state first — would otherwise share a key and overwrite.
    while (existing.some((version) => version.createdAt === createdAt)) createdAt += 1;

    const version: NoteVersion = {
      id: versionId(noteId, createdAt),
      noteId,
      createdAt,
      reason,
      label,
      doc,
    };

    const tx = db.transaction('versions', 'readwrite');
    await tx.store.put(version);
    for (const stale of prunable([version, ...existing])) await tx.store.delete(stale.id);
    await tx.done;

    return version;
  } catch {
    return null;
  }
}

/** Newest first — the order the restore list shows them in. */
export async function listVersions(noteId: string): Promise<NoteVersion[]> {
  const db = await getDb();
  if (!db) return [];
  const all = await db.getAllFromIndex('versions', 'by-note', noteId);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function loadVersion(id: string): Promise<NoteVersion | null> {
  const db = await getDb();
  return (await db?.get('versions', id)) ?? null;
}

/** Called when a note is deleted, so history cannot outlive the thing it is the history of. */
export async function deleteVersions(noteId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const tx = db.transaction('versions', 'readwrite');
  const keys = await tx.store.index('by-note').getAllKeys(noteId);
  await Promise.all(keys.map((key) => tx.store.delete(key)));
  await tx.done;
}

/** The edit snapshots past the cap, oldest first. Exported for the test that fixes the policy. */
export function prunable(versions: NoteVersion[]): NoteVersion[] {
  const edits = versions
    .filter((version) => version.reason === 'edit' || version.reason === 'restore')
    .sort((a, b) => b.createdAt - a.createdAt);
  return edits.slice(MAX_EDIT_VERSIONS);
}
