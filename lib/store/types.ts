/**
 * The local half of the data model (02-ARCHITECTURE.md §4, "Local (signed-out / offline)").
 *
 * Everything a signed-out student does lives here and only here. The shapes deliberately mirror
 * the Postgres tables they will sync into, so the merge on first sign-in is a copy rather than a
 * translation — `localId` is the dedupe key named in §4.
 */
import type { EnhanceOptions, NoteContext } from '@/lib/ai/schema';
import type { ExtractedBlock, ExtractedMeta } from '@/lib/ingest/types';
import type { QualitySignal } from '@/lib/ingest/quality';

/** An `ExtractedDoc` with the blobs lifted out — those live in the `assets` store. */
export interface StoredDoc {
  blocks: ExtractedBlock[];
  meta: ExtractedMeta;
}

/**
 * A parsed image on its way to the review screen.
 *
 * `bytes`, not the `Blob` the parser produced. WebKit refuses to store a canvas-backed Blob —
 * "Error preparing Blob/File data to be stored in object store" — which on an iPhone made every
 * photo upload hang on "Reading…" forever. An ArrayBuffer is plainly structured-cloneable
 * everywhere, and the Blob is rebuilt on read, where the mime type is right there beside it.
 */
export interface StoredAsset {
  id: string;
  draftId: string;
  sourceId: string;
  kind: 'embedded' | 'page-thumb' | 'photo';
  mime: string;
  bytes: ArrayBuffer;
  width: number;
  height: number;
  alt?: string;
}

export type DraftStatus = 'ingesting' | 'reviewing' | 'ready';

export interface DetectionState {
  confidence: number;
  /** Where the current context came from. `user` means every field is confirmed. */
  source: 'heuristic' | 'model' | 'user';
  isStudyNotes: boolean | null;
  /** True once the student has touched any context field; suppresses re-detection. */
  edited: boolean;
}

/**
 * One in-progress ingestion — everything `/app/new` and `/app/review` know.
 *
 * Written on every meaningful change so a refresh, a crashed tab or a dead battery never costs a
 * student the twenty minutes they spent fixing OCR (phase-03 DoD). It is one record rather than a
 * row per block because it is always read and written whole, and because a partial draft is worse
 * than no draft.
 */
export interface LocalDraft {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: DraftStatus;
  title: string;
  doc: StoredDoc;
  context: NoteContext;
  /**
   * What language the notes were written in, as opposed to `context.language`, which is the
   * language the study guide comes back in. They are the same by default — 01-PRODUCT.md §7:
   * notes in Chinese come back in Chinese — and the "answer in the same language" toggle is what
   * separates them, so the original has to be remembered to toggle back to.
   */
  notesLanguage: string;
  detection: DetectionState;
  options: EnhanceOptions;
  packId: string | null;
  packName: string | null;
  /** Cloudflare Turnstile, captured on `/app/new` for phase-04 to verify (02 §7 layer 3). */
  turnstileToken: string | null;
  quality: QualitySignal[];
}

/** Mirrors the `note` table. `status: 'draft'` until phase-04 generates into it. */
export interface LocalNote {
  id: string;
  localId: string;
  createdAt: number;
  updatedAt: number;
  title: string;
  status: 'draft' | 'generating' | 'ready' | 'error';
  context: NoteContext;
  options: EnhanceOptions;
  /** The draft this came from, so `/app/note/:id` can offer "back to review". */
  draftId: string;
  source: {
    kind: 'upload' | 'paste' | 'mixed';
    filenames: string[];
    extractedCharCount: number;
    ocrPages: number;
  };
  /** The confirmed extraction, handed to the enhance call in phase-04. */
  doc: StoredDoc;
}
