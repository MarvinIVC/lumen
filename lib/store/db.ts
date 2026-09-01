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

import type {
  LocalCourse,
  LocalDraft,
  LocalNote,
  LocalUnit,
  NoteVersion,
  OutboxEntry,
  StoredAsset,
  SyncMeta,
} from './types';

export const DB_NAME = 'lumen';
export const DB_VERSION = 3;

interface LumenDB extends DBSchema {
  drafts: {
    key: string;
    value: LocalDraft;
    indexes: { 'by-updatedAt': number };
  };
  assets: {
    key: string;
    value: StoredAsset;
    indexes: { 'by-draft': string; 'by-note': string };
  };
  notes: {
    key: string;
    value: LocalNote;
    indexes: { 'by-updatedAt': number };
  };
  /** Version history (phase-05 §13). Snapshots are large; they get their own store for the same
   *  reason the assets do — a note is written on every autosave and must not carry them. */
  versions: {
    key: string;
    value: NoteVersion;
    indexes: { 'by-note': string };
  };
  courses: {
    key: string;
    value: LocalCourse;
    indexes: { 'by-ordinal': number };
  };
  units: {
    key: string;
    value: LocalUnit;
    indexes: { 'by-course': string; 'by-ordinal': number };
  };
  outbox: {
    key: string;
    value: OutboxEntry;
    indexes: { 'by-createdAt': number; 'by-entity': string };
  };
  syncMeta: {
    key: 'state';
    value: SyncMeta;
  };
}

let dbPromise: Promise<IDBPDatabase<LumenDB> | null> | null = null;

export function getDb(): Promise<IDBPDatabase<LumenDB> | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  dbPromise ??= openDB<LumenDB>(DB_NAME, DB_VERSION, {
    /**
     * Migrations are cumulative and keyed on `oldVersion`, not unconditional.
     *
     * The v1 body created all three stores every time it ran, which was correct exactly once —
     * for a browser that had never opened this database. Bumping to 2 without this guard would
     * have called `createObjectStore('drafts')` on every existing student's database, thrown
     * `ConstraintError` inside the upgrade transaction, and taken `getDb()` down its `.catch(null)`
     * path: no drafts, no notes, no history, silently, for everyone who had used the product
     * before today.
     */
    upgrade(db, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        const drafts = db.createObjectStore('drafts', { keyPath: 'id' });
        drafts.createIndex('by-updatedAt', 'updatedAt');

        const assets = db.createObjectStore('assets', { keyPath: 'id' });
        assets.createIndex('by-draft', 'draftId');

        const notes = db.createObjectStore('notes', { keyPath: 'id' });
        notes.createIndex('by-updatedAt', 'updatedAt');
      }

      // v2 (phase-05): version history.
      if (oldVersion < 2) {
        const versions = db.createObjectStore('versions', { keyPath: 'id' });
        versions.createIndex('by-note', 'noteId');
      }

      // v3 (phase-06): the local library and an outbox. Existing note/draft rows are untouched.
      if (oldVersion < 3) {
        const assets = transaction.objectStore('assets');
        if (!assets.indexNames.contains('by-note')) assets.createIndex('by-note', 'noteId');

        const courses = db.createObjectStore('courses', { keyPath: 'id' });
        courses.createIndex('by-ordinal', 'ordinal');

        const units = db.createObjectStore('units', { keyPath: 'id' });
        units.createIndex('by-course', 'courseId');
        units.createIndex('by-ordinal', 'ordinal');

        const outbox = db.createObjectStore('outbox', { keyPath: 'id' });
        outbox.createIndex('by-createdAt', 'createdAt');
        outbox.createIndex('by-entity', 'entity');

        db.createObjectStore('syncMeta', { keyPath: 'id' });
      }
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
