/**
 * IndexedDB, through `idb` (02-ARCHITECTURE.md §4).
 *
 * Three stores and one rule: blobs never go in the same record as the thing that references them.
 * A draft is read and written on every keystroke-ish change, and carrying twenty page thumbnails
 * through each of those writes would make autosave the slowest thing on the screen.
 *
 * Every entry point returns `null` rather than throwing when IndexedDB is unavailable — Safari
 * private browsing and a locked-down school device both do that, and the answer is to keep
 * working in memory for this session, not to show a database error to someone who wanted to fix
 * their chemistry notes.
 */
import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';

import type { LocalDraft, LocalNote, StoredAsset } from './types';

export const DB_NAME = 'lumen';
export const DB_VERSION = 1;

interface LumenDB extends DBSchema {
  drafts: {
    key: string;
    value: LocalDraft;
    indexes: { 'by-updatedAt': number };
  };
  assets: {
    key: string;
    value: StoredAsset;
    indexes: { 'by-draft': string };
  };
  notes: {
    key: string;
    value: LocalNote;
    indexes: { 'by-updatedAt': number };
  };
}

let dbPromise: Promise<IDBPDatabase<LumenDB> | null> | null = null;

export function getDb(): Promise<IDBPDatabase<LumenDB> | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  dbPromise ??= openDB<LumenDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const drafts = db.createObjectStore('drafts', { keyPath: 'id' });
      drafts.createIndex('by-updatedAt', 'updatedAt');

      const assets = db.createObjectStore('assets', { keyPath: 'id' });
      assets.createIndex('by-draft', 'draftId');

      const notes = db.createObjectStore('notes', { keyPath: 'id' });
      notes.createIndex('by-updatedAt', 'updatedAt');
    },
    blocked() {
      // Another tab is holding an old version open. Nothing to do but let it finish.
    },
  }).catch(() => null);
  return dbPromise;
}

/** Test seam, and the escape hatch after a failed open. */
export function __resetDb(): void {
  dbPromise = null;
}
