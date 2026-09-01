'use client';

/**
 * The workspace's state (phase-05 §13).
 *
 * One document, one place that mutates it, one autosave. Read view, edit view, accept/reject,
 * regenerate and "ask about this" all funnel through `apply`, which is the only function that
 * writes `doc` — so there is exactly one place where "did that get saved?" and "can I undo that?"
 * are answered, rather than one per feature.
 *
 * Three decisions worth stating:
 *
 *   Autosave is debounced and local-only. Signed-out students are the default case in this product
 *   and IndexedDB is the whole of their storage; the cloud half arrives in phase-06 and this is
 *   where it hooks in. Offline is not an error state here — it is the normal one.
 *
 *   Undo is a document stack, not a text stack. TipTap has its own history for typing, which is
 *   the right granularity for prose; this one is for the operations that are not typing — accept
 *   all, keep only mine, apply a regenerated section — where the unit a student wants back is the
 *   whole document as it was before they pressed the button.
 *
 *   A snapshot every five minutes of *editing*, not every five minutes. A note left open in a
 *   background tab all afternoon should not collect eighty identical copies of itself, and
 *   `snapshot()` deduplicates against the newest one as a second line of defence.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { migrateNoteDocument } from '@/lib/ai/validate';
import { saveNote } from '@/lib/store/drafts';
import { SNAPSHOT_INTERVAL_MS, listVersions, snapshot } from '@/lib/store/versions';
import type { NoteDocument } from '@/lib/ai/schema';
import type { LocalNote, NoteVersion, VersionReason } from '@/lib/store/types';

/** Long enough that typing does not thrash IndexedDB, short enough to survive a closed laptop. */
const AUTOSAVE_MS = 800;

/** How deep the operation undo stack goes. Beyond this, version history is the answer. */
const UNDO_DEPTH = 30;

export interface WorkspaceState {
  doc: NoteDocument;
  /** True between an edit and the write that persists it. */
  saving: boolean;
  /** True once anything has been changed in this session. */
  edited: boolean;
  offline: boolean;
  canUndo: boolean;
  versions: NoteVersion[];
  /**
   * `immediate` skips the debounce.
   *
   * The debounce exists for keystrokes. Everything else — accept all, keep only mine, applying a
   * regenerated section, inserting an answer, restoring a version — is one deliberate press with
   * nothing to coalesce, and a student who presses one and immediately navigates away should not
   * be racing an 800 ms timer for their own change.
   */
  apply: (next: NoteDocument, label: string, immediate?: boolean) => void;
  undo: () => void;
  /** Forces a snapshot now — used when a generation or a regeneration lands. */
  mark: (reason: VersionReason, label: string) => Promise<void>;
  restore: (versionId: string) => void;
  refreshVersions: () => Promise<void>;
}

export function useWorkspace(note: LocalNote, initial: NoteDocument): WorkspaceState {
  // Migrated once, on the way in. A note generated under schema 1.0.0 has no block ids, and every
  // other function here addresses blocks by id — so this is the boundary at which an old document
  // becomes one the workspace can work on at all.
  const [doc, setDoc] = useState<NoteDocument>(() => migrateNoteDocument(initial));
  const [saving, setSaving] = useState(false);
  const [edited, setEdited] = useState(false);
  const [versions, setVersions] = useState<NoteVersion[]>([]);
  const [offline, setOffline] = useState(false);

  const undoStack = useRef<NoteDocument[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The document waiting to be written, so an unmount can finish the job rather than cancel it. */
  const pending = useRef<NoteDocument | null>(null);
  const lastSnapshot = useRef<number>(Date.now());
  // The note as it was loaded. `saveNote` writes the whole record, so the fields the workspace does
  // not own — the source, the context, the turnstile token — have to come from somewhere.
  const base = useRef(note);
  base.current = note;

  const refreshVersions = useCallback(async () => {
    setVersions(await listVersions(note.id));
  }, [note.id]);

  useEffect(() => {
    void refreshVersions();
  }, [refreshVersions]);

  /* Offline ---------------------------------------------------------------- */
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  /* Persisting ------------------------------------------------------------- */
  const persist = useCallback(async (next: NoteDocument) => {
    pending.current = null;
    await saveNote({ ...base.current, generated: next, edited: true, status: 'ready' });
    setSaving(false);
  }, []);

  /** Schedules the write, replacing any write already waiting. */
  const schedule = useCallback(
    (next: NoteDocument, immediate = false) => {
      pending.current = next;
      setSaving(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (immediate) {
        saveTimer.current = null;
        void persist(next);
        return;
      }
      saveTimer.current = setTimeout(() => void persist(next), AUTOSAVE_MS);
    },
    [persist],
  );

  /**
   * Writes a waiting edit immediately.
   *
   * The debounce is what stops every keystroke hitting IndexedDB, and it is also an 800 ms window
   * in which closing the tab loses the last thing the student typed. Clearing the timer on unmount
   * without flushing — which is what this did first — turns that window from unlikely into
   * *certain* for anyone who edits and immediately navigates away, and it is invisible: the note
   * simply opens without their change next time.
   */
  const flush = useCallback(() => {
    if (!pending.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    void persist(pending.current);
  }, [persist]);

  // `pagehide` fires on a reload, a navigation and a closed tab; `visibilitychange` catches the
  // mobile case where a tab is backgrounded and never comes back. Neither guarantees an async
  // IndexedDB write completes, but starting it is strictly better than cancelling it.
  useEffect(() => {
    const onHide = () => flush();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [flush]);

  const mark = useCallback(
    async (reason: VersionReason, label: string) => {
      await snapshot(base.current.id, doc, reason, label);
      lastSnapshot.current = Date.now();
      await refreshVersions();
    },
    [doc, refreshVersions],
  );

  /**
   * The one function that changes the document.
   *
   * Written against `doc` from state rather than inside a `setDoc` updater: the updater has to be
   * a pure function of the previous state, and this needs to push an undo entry, take a snapshot
   * and schedule a write. React is entitled to call an updater twice, and under
   * `reactStrictMode` in development it does — which would have meant two undo entries per edit
   * and two timers racing to write.
   */
  const apply = useCallback(
    (next: NoteDocument, label: string, immediate = false) => {
      if (next === doc) return;

      undoStack.current = [doc, ...undoStack.current].slice(0, UNDO_DEPTH);
      setCanUndo(true);

      // The periodic snapshot rides on an edit rather than on a timer, so it can only fire while
      // something is actually being changed. It captures the document *before* this edit, which is
      // what "restore to five minutes ago" has to mean.
      if (Date.now() - lastSnapshot.current > SNAPSHOT_INTERVAL_MS) {
        lastSnapshot.current = Date.now();
        void snapshot(base.current.id, doc, 'edit', label).then(() => void refreshVersions());
      }

      setDoc(next);
      setEdited(true);
      schedule(next, immediate);
    },
    [doc, refreshVersions, schedule],
  );

  const undo = useCallback(() => {
    const [previous, ...rest] = undoStack.current;
    if (!previous) return;
    undoStack.current = rest;
    setCanUndo(rest.length > 0);
    setDoc(previous);
    schedule(previous, true);
  }, [schedule]);

  /**
   * Restoring an old version snapshots the current one first.
   *
   * Otherwise "restore" is a one-way door: a student who restores to look at something and then
   * wants their edits back has no way to get them, and the feature that exists to make edits safe
   * would be the one that lost them.
   */
  const restore = useCallback(
    (versionId: string) => {
      const target = versions.find((version) => version.id === versionId);
      if (!target) return;
      void snapshot(base.current.id, doc, 'restore', 'Before restoring').then(() =>
        refreshVersions(),
      );
      apply(migrateNoteDocument(target.doc), 'Restored a previous version', true);
    },
    [apply, doc, refreshVersions, versions],
  );

  /* Unmounting is a navigation away; the waiting write goes with it rather than being dropped. */
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(
    () => () => {
      flushRef.current();
    },
    [],
  );

  return useMemo(
    () => ({
      doc,
      saving,
      edited: edited || Boolean(note.edited),
      offline,
      canUndo,
      versions,
      apply,
      undo,
      mark,
      restore,
      refreshVersions,
    }),
    [
      doc,
      saving,
      edited,
      note.edited,
      offline,
      canUndo,
      versions,
      apply,
      undo,
      mark,
      restore,
      refreshVersions,
    ],
  );
}
