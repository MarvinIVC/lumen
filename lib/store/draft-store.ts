'use client';

/**
 * The workspace store for `/app/new` and `/app/review` (02-ARCHITECTURE.md §2: Zustand for
 * session state).
 *
 * One draft at a time, one shape, and every mutation lands in IndexedDB within half a second.
 * That last part is the whole reason this file exists rather than a pile of `useState`: the review
 * screen is where a student spends real time — fixing OCR, deleting the teacher's footer, naming
 * the unit — and losing that to a refresh would be the single most expensive bug in the product.
 *
 * Parsing lives in `lib/ingest` and knows nothing about this store. The store calls it, tracks the
 * per-file rows, and merges what comes back.
 */
import { create } from 'zustand';

import {
  IngestError,
  capBlocks,
  emptyDoc,
  kindOf,
  mergeDocs,
  newId,
  parseFile,
  parsePaste,
  precheck,
  recount,
  splitDoc,
} from '@/lib/ingest';
import type { ExtractedAsset, ExtractedBlock, ExtractedDoc } from '@/lib/ingest';
import { assessQuality } from '@/lib/ingest/quality';
import { detectLocally, isConfident, mergeDetection } from '@/lib/curriculum/detect';
import { detectRemote } from '@/lib/ai/detect-client';
import { matchPack } from '@/lib/curriculum/load';
import type { EnhanceOptions, NoteContext } from '@/lib/ai/schema';

import {
  copyAssets,
  deleteDraft,
  loadDraft,
  putAssets,
  saveDraft,
  saveNote,
  toStoredDoc,
} from './drafts';
import type { LocalDraft, LocalNote } from './types';

/** A row in the dropzone. Mirrors `UploadItem` and adds what the store needs to retry. */
export interface UploadRow {
  id: string;
  sourceId: string;
  name: string;
  size: number;
  kind: 'document' | 'image';
  state: 'queued' | 'reading' | 'done' | 'error';
  progress?: number;
  error?: string;
  code?: IngestError['code'];
  /** The unparsed file, kept only while a retry is still possible (a password prompt). */
  file?: File;
}

export const DEFAULT_OPTIONS: EnhanceOptions = {
  mode: 'complete',
  depth: 'match',
  visuals: 'auto',
  voice: 'keep-mine',
};

export const EMPTY_CONTEXT: NoteContext = {
  subject: '',
  curriculum: 'UNKNOWN',
  course: '',
  unit: null,
  topic: null,
  language: 'en',
};

interface DraftState {
  draft: LocalDraft | null;
  /** Live blobs for this session. Persisted copies live in the `assets` store. */
  assets: Map<string, ExtractedAsset>;
  rows: UploadRow[];
  hydrated: boolean;
  /** Set while a parse is running, so the screen can say so and the CTA can wait. */
  parsing: boolean;
  /** The file a password is being asked for, if any. */
  passwordFor: UploadRow | null;

  createDraft: () => LocalDraft;
  hydrate: (draftId: string | null) => Promise<void>;
  addFiles: (files: File[]) => Promise<void>;
  retryWithPassword: (rowId: string, password: string) => Promise<void>;
  promptForPassword: (rowId: string) => void;
  dismissPasswordPrompt: () => void;
  removeRow: (rowId: string) => void;
  addPaste: (text: string) => void;

  updateBlock: (blockId: string, text: string) => void;
  deleteBlock: (blockId: string) => void;
  mergeBlockUp: (blockId: string) => void;
  moveBlock: (blockId: string, direction: -1 | 1) => void;
  setBlockText: (blockId: string, text: string, options?: { clearOcr?: boolean }) => void;
  splitLesson: (blockIndex: number) => Promise<string | null>;

  runDetection: () => Promise<void>;
  setContext: (patch: Partial<NoteContext>) => void;
  setNotesLanguage: (language: string) => void;
  setOptions: (patch: Partial<EnhanceOptions>) => void;
  setTurnstileToken: (token: string | null) => void;
  setTitle: (title: string) => void;

  createNote: () => Promise<string | null>;
  discard: () => Promise<void>;
}

/** 01-PRODUCT.md §5, last row: never a raw stack trace, and always something to do next. */
const UNEXPECTED_ERROR =
  'Something went wrong reading that file, and it is our fault rather than yours. ' +
  'Try another copy of it, or paste the text in instead.';

/**
 * Surfaces an unexpected failure to the error monitor without failing the ingestion it came from.
 *
 * A bare `throw` inside the parse loop stopped the batch and left the file's row reading forever;
 * rethrowing on a macrotask keeps the loop going and still produces the unhandled rejection that
 * Sentry's global handler reports.
 */
function reportUnexpected(error: unknown): void {
  setTimeout(() => {
    throw error;
  }, 0);
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Debounced so typing in a block is one write per pause rather than one per keystroke, and short
 * enough that a student who closes the tab immediately after an edit still keeps it.
 */
const SAVE_DELAY_MS = 400;

function schedulePersist(get: () => DraftState) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const draft = get().draft;
    if (draft) void saveDraft(draft);
  }, SAVE_DELAY_MS);
}

/** Writes immediately — for navigation, where the debounce would lose the last change. */
export async function flushDraft(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const draft = useDraftStore.getState().draft;
  if (draft) await saveDraft(draft);
}

function blankDraft(): LocalDraft {
  const now = Date.now();
  return {
    id: newId('drf'),
    createdAt: now,
    updatedAt: now,
    status: 'ingesting',
    title: '',
    doc: toStoredDoc(emptyDoc()),
    context: { ...EMPTY_CONTEXT },
    notesLanguage: 'en',
    detection: { confidence: 0, source: 'heuristic', isStudyNotes: null, edited: false },
    options: { ...DEFAULT_OPTIONS },
    packId: null,
    packName: null,
    turnstileToken: null,
    quality: [],
  };
}

/** The text the detector and the quality gate read: the notes, without the image placeholders. */
export function draftText(blocks: ExtractedBlock[]): string {
  return blocks
    .filter((block) => block.kind !== 'image')
    .map((block) => block.text)
    .join('\n\n');
}

/** First heading, else first paragraph, trimmed to something that fits a card. */
export function titleFrom(blocks: ExtractedBlock[]): string {
  const heading = blocks.find((block) => block.kind === 'heading');
  const source = heading ?? blocks.find((block) => block.kind === 'paragraph');
  if (!source) return 'Untitled notes';
  return (
    source.text
      .replace(/^#+\s*/, '')
      .slice(0, 80)
      .trim() || 'Untitled notes'
  );
}

export const useDraftStore = create<DraftState>((set, get) => {
  /** Applies a change to the draft and schedules the write. The only way state is mutated. */
  const patch = (mutate: (draft: LocalDraft) => LocalDraft) => {
    const current = get().draft;
    if (!current) return;
    set({ draft: { ...mutate(current), updatedAt: Date.now() } });
    schedulePersist(get);
  };

  const patchBlocks = (mutate: (blocks: ExtractedBlock[]) => ExtractedBlock[]) => {
    patch((draft) => {
      const blocks = mutate(draft.doc.blocks);
      const counted = recount({ blocks, assets: [], meta: draft.doc.meta });
      return {
        ...draft,
        doc: { blocks, meta: counted.meta },
        quality: assessQuality(blocks).signals,
        title: draft.title || titleFrom(blocks),
      };
    });
  };

  /**
   * Folds a freshly parsed document into the draft.
   *
   * The blob write is awaited rather than fired and forgotten. It is tempting not to — nothing on
   * screen is waiting for it — but a student who refreshes the instant a photo finishes parsing
   * would come back to a block that references an asset the database never received, and a
   * scanned page with no picture is the one thing on the review screen they cannot act on.
   */
  const absorb = async (doc: ExtractedDoc) => {
    const draft = get().draft;
    if (!draft) return;

    const merged = mergeDocs([{ ...draft.doc, assets: [] }, doc]);
    const assets = new Map(get().assets);
    for (const asset of doc.assets) assets.set(asset.id, asset);
    set({ assets });
    await putAssets(draft.id, doc.assets);

    patch((current) => ({
      ...current,
      doc: toStoredDoc(merged),
      quality: assessQuality(merged.blocks).signals,
      title: current.title || titleFrom(merged.blocks),
    }));
  };

  return {
    draft: null,
    assets: new Map(),
    rows: [],
    hydrated: false,
    parsing: false,
    passwordFor: null,

    createDraft() {
      const draft = blankDraft();
      set({ draft, rows: [], assets: new Map(), hydrated: true });
      void saveDraft(draft);
      return draft;
    },

    async hydrate(draftId) {
      if (draftId) {
        const stored = await loadDraft(draftId);
        if (stored) {
          // The rows are rebuilt from the sources rather than persisted: a half-finished parse is
          // not resumable, and a row that says "reading" forever after a refresh is a lie.
          set({
            draft: stored,
            hydrated: true,
            rows: stored.doc.meta.sourceFiles
              .filter((source) => source.kind !== 'paste')
              .map((source) => ({
                id: source.id,
                sourceId: source.id,
                name: source.name,
                size: source.size,
                kind: kindOf(source.name),
                state: 'done' as const,
              })),
          });
          return;
        }
      }
      get().createDraft();
    },

    async addFiles(files) {
      if (!get().draft) get().createDraft();
      set({ parsing: true });

      const queued: UploadRow[] = files.map((file) => ({
        id: newId('row'),
        sourceId: newId('src'),
        name: file.name,
        size: file.size,
        kind: kindOf(file.name),
        state: 'queued',
      }));
      set({ rows: [...get().rows, ...queued] });

      const update = (rowId: string, next: Partial<UploadRow>) => {
        set({
          rows: get().rows.map((row) => (row.id === rowId ? { ...row, ...next } : row)),
        });
      };

      for (const [index, file] of files.entries()) {
        const row = queued[index];
        if (!row) continue;

        const rejected = precheck(file);
        if (rejected) {
          update(row.id, { state: 'error', error: rejected.message, code: rejected.code });
          continue;
        }

        update(row.id, { state: 'reading', progress: 0 });
        try {
          const doc = await parseFile(file, {
            sourceId: row.sourceId,
            onProgress: (fraction) => update(row.id, { progress: Math.round(fraction * 100) }),
          });
          await absorb(doc);
          update(row.id, { state: 'done', progress: 100 });
        } catch (error) {
          if (error instanceof IngestError) {
            update(row.id, {
              state: 'error',
              error: error.message,
              code: error.code,
              ...(error.code === 'encrypted' ? { file } : {}),
            });
            if (error.code === 'encrypted') {
              const stored = get().rows.find((entry) => entry.id === row.id) ?? null;
              set({ passwordFor: stored });
            }
            continue;
          }
          // Not something the student did. The row must still resolve — a spinner that never
          // stops is the worst of the failure modes, and it is what a rethrow here produced on
          // WebKit — and the next file in the batch must still be read. Reported, not swallowed:
          // `reportUnexpected` rethrows out of band so Sentry sees the real error and the student
          // sees 01-PRODUCT.md §5's last row instead of a stack trace.
          update(row.id, { state: 'error', error: UNEXPECTED_ERROR, code: 'corrupt' });
          reportUnexpected(error);
        }
      }

      set({ parsing: false });
    },

    async retryWithPassword(rowId, password) {
      const row = get().rows.find((entry) => entry.id === rowId);
      if (!row?.file) return;
      set({ passwordFor: null, parsing: true });

      const update = (next: Partial<UploadRow>) =>
        set({
          rows: get().rows.map((entry) => (entry.id === rowId ? { ...entry, ...next } : entry)),
        });

      update({ state: 'reading', progress: 0, error: undefined, code: undefined });
      try {
        const doc = await parseFile(row.file, {
          sourceId: row.sourceId,
          password,
          onProgress: (fraction) => update({ progress: Math.round(fraction * 100) }),
        });
        await absorb(doc);
        update({ state: 'done', progress: 100, file: undefined });
      } catch (error) {
        if (error instanceof IngestError) {
          update({ state: 'error', error: error.message, code: error.code });
          if (error.code === 'encrypted') {
            set({ passwordFor: get().rows.find((entry) => entry.id === rowId) ?? null });
          }
        } else {
          update({ state: 'error', error: UNEXPECTED_ERROR, code: 'corrupt' });
          reportUnexpected(error);
        }
      } finally {
        set({ parsing: false });
      }
    },

    promptForPassword(rowId) {
      set({ passwordFor: get().rows.find((entry) => entry.id === rowId) ?? null });
    },

    dismissPasswordPrompt() {
      set({ passwordFor: null });
    },

    removeRow(rowId) {
      const row = get().rows.find((entry) => entry.id === rowId);
      set({ rows: get().rows.filter((entry) => entry.id !== rowId) });
      if (!row) return;
      patch((draft) => {
        const blocks = draft.doc.blocks.filter((block) => block.pageRef.sourceId !== row.sourceId);
        const counted = recount({ blocks, assets: [], meta: draft.doc.meta });
        return { ...draft, doc: { blocks, meta: counted.meta } };
      });
    },

    addPaste(text) {
      if (!get().draft) get().createDraft();
      if (!text.trim()) return;
      // Pasted text carries no assets, so there is nothing to wait for.
      void absorb(parsePaste(text));
    },

    updateBlock(blockId, text) {
      get().setBlockText(blockId, text);
    },

    setBlockText(blockId, text, options) {
      patchBlocks((blocks) =>
        blocks.map((block) =>
          block.id === blockId
            ? {
                ...block,
                text,
                edited: true,
                ...(options?.clearOcr ? { needsOCR: false, kind: 'paragraph' as const } : {}),
              }
            : block,
        ),
      );
    },

    deleteBlock(blockId) {
      patchBlocks((blocks) => blocks.filter((block) => block.id !== blockId));
    },

    mergeBlockUp(blockId) {
      patchBlocks((blocks) => {
        const index = blocks.findIndex((block) => block.id === blockId);
        if (index <= 0) return blocks;
        const previous = blocks[index - 1];
        const current = blocks[index];
        if (!previous || !current) return blocks;
        const merged: ExtractedBlock = {
          ...previous,
          kind: previous.kind === 'image' ? current.kind : previous.kind,
          text: `${previous.text}\n${current.text}`.trim(),
          edited: true,
        };
        return [...blocks.slice(0, index - 1), merged, ...blocks.slice(index + 1)];
      });
    },

    moveBlock(blockId, direction) {
      patchBlocks((blocks) => {
        const index = blocks.findIndex((block) => block.id === blockId);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= blocks.length) return blocks;
        const next = [...blocks];
        const [moved] = next.splice(index, 1);
        if (moved) next.splice(target, 0, moved);
        return next;
      });
    },

    async splitLesson(blockIndex) {
      const draft = get().draft;
      if (!draft) return null;
      const [head, tail] = splitDoc({ ...draft.doc, assets: [] }, blockIndex);
      if (tail.blocks.length === 0) return null;

      const second: LocalDraft = {
        ...blankDraft(),
        status: 'reviewing',
        doc: toStoredDoc(tail),
        context: { ...draft.context },
        notesLanguage: draft.notesLanguage,
        detection: { ...draft.detection },
        options: { ...draft.options },
        title: titleFrom(tail.blocks),
        quality: assessQuality(tail.blocks).signals,
      };
      await saveDraft(second);

      // The tail's blocks still point at asset ids filed under the draft they were split from, so
      // without this the second lesson opens with every scanned page missing — and discarding the
      // first draft would delete the rows the second one needs.
      await copyAssets(
        second.id,
        tail.blocks.map((block) => block.assetId).filter((id): id is string => Boolean(id)),
        [...get().assets.values()],
      );

      patch((current) => ({
        ...current,
        doc: toStoredDoc(head),
        quality: assessQuality(head.blocks).signals,
      }));
      await flushDraft();
      return second.id;
    },

    async runDetection() {
      const draft = get().draft;
      if (!draft || draft.detection.edited) return;

      const text = draftText(draft.doc.blocks);
      if (!text.trim()) return;

      const local = detectLocally(text);
      const context: NoteContext = {
        subject: local.subject ?? '',
        curriculum: local.curriculum,
        course: local.course ?? '',
        unit: local.unit,
        topic: local.topic,
        language: local.language,
      };

      // 04-AI-ENGINE.md §3: the model classify runs only when the local pass scores under 0.7.
      // `isDetectAvailable()` is false until phase-04 deploys the function, and an unsure answer
      // is then shown as a question the student answers rather than as an assertion.
      const model = isConfident(local)
        ? null
        : await detectRemote(text, { turnstileToken: draft.turnstileToken });
      const merged = mergeDetection(local, model);
      const resolved: NoteContext = model
        ? {
            subject: merged.subject,
            curriculum: merged.curriculum,
            course: merged.course,
            unit: merged.unit,
            topic: merged.topic,
            language: merged.language,
          }
        : context;
      const match = await matchPack(resolved);

      /*
       * Detection must never overwrite what the student typed.
       *
       * Everything above this line can wait on the network — the pack manifest is a chunk, and the
       * classify call in phase-04 is a request — and the student is looking at an editable form the
       * whole time. On a deployed build that window is hundreds of milliseconds, long enough to
       * land squarely on their first keystroke: they set the unit, the awaited detection resolved
       * behind them, and their answer was replaced by the guess *and* marked unedited, so a reload
       * showed an empty field. Locally the chunk is instant and the window is nothing, which is why
       * only the run against the real Worker found it.
       *
       * If they have edited, their context stands and only the pack is re-matched — against what
       * they said, not against what we guessed.
       */
      const after = get().draft;
      if (!after || after.id !== draft.id) return;
      if (after.detection.edited) {
        await refreshPack(get, patch);
        return;
      }

      patch((current) => ({
        ...current,
        notesLanguage: resolved.language,
        context: { ...resolved, packId: match?.pack.id ?? null },
        packId: match?.pack.id ?? null,
        packName: match?.pack.displayName ?? null,
        detection: {
          confidence: merged.confidence,
          source: model ? 'model' : 'heuristic',
          isStudyNotes: merged.isStudyNotes,
          edited: false,
        },
      }));
    },

    setContext(next) {
      patch((draft) => ({
        ...draft,
        context: { ...draft.context, ...next },
        detection: { ...draft.detection, source: 'user', edited: true, confidence: 1 },
      }));
      void refreshPack(get, patch);
    },

    setNotesLanguage(language) {
      patch((draft) => ({
        ...draft,
        notesLanguage: language,
        // Following the notes is the default, so changing the source language moves the output
        // language with it unless the student has deliberately asked for English.
        context: {
          ...draft.context,
          language:
            draft.context.language === draft.notesLanguage ? language : draft.context.language,
        },
        detection: { ...draft.detection, source: 'user', edited: true },
      }));
    },

    setOptions(next) {
      patch((draft) => ({ ...draft, options: { ...draft.options, ...next } }));
    },

    setTurnstileToken(token) {
      patch((draft) => ({ ...draft, turnstileToken: token }));
    },

    setTitle(title) {
      patch((draft) => ({ ...draft, title }));
    },

    async createNote() {
      const draft = get().draft;
      if (!draft) return null;

      const { blocks } = capBlocks(draft.doc.blocks);
      const counted = recount({ blocks, assets: [], meta: draft.doc.meta });
      const sources = draft.doc.meta.sourceFiles;
      const pasted = sources.some((source) => source.kind === 'paste');
      const uploaded = sources.some((source) => source.kind !== 'paste');

      const note: LocalNote = {
        id: newId('nte'),
        localId: draft.id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        title: draft.title || titleFrom(blocks),
        status: 'draft',
        context: draft.context,
        options: draft.options,
        draftId: draft.id,
        source: {
          kind: pasted && uploaded ? 'mixed' : pasted ? 'paste' : 'upload',
          filenames: sources.map((source) => source.name),
          extractedCharCount: counted.meta.charCount,
          ocrPages: blocks.filter((block) => block.needsOCR).length,
        },
        doc: { blocks, meta: counted.meta },
      };

      await saveNote(note);
      patch((current) => ({ ...current, status: 'ready' }));
      await flushDraft();
      return note.id;
    },

    async discard() {
      const draft = get().draft;
      if (draft) await deleteDraft(draft.id);
      set({ draft: null, rows: [], assets: new Map(), hydrated: false });
    },
  };
});

/** Re-runs the pack match after the student corrects the course. */
async function refreshPack(
  get: () => DraftState,
  patch: (mutate: (draft: LocalDraft) => LocalDraft) => void,
): Promise<void> {
  const draft = get().draft;
  if (!draft) return;
  const match = await matchPack(draft.context);
  patch((current) => ({
    ...current,
    packId: match?.pack.id ?? null,
    packName: match?.pack.displayName ?? null,
    context: { ...current.context, packId: match?.pack.id ?? null },
  }));
}
