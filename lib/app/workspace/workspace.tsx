'use client';

/**
 * The note workspace (phase-05) — Read, Edit and Study over one document.
 *
 * The shell owns three things and delegates everything else: which view is showing, the dialogs
 * that can be opened from any of them, and the single `apply` through which every change to the
 * document passes. `useWorkspace` holds the document, the autosave and the history; the three views
 * are pure functions of it.
 *
 * The mode lives in the URL (`?mode=edit`). It costs nothing and buys three things a student will
 * assume work: the back button leaves the editor, a reload does not throw away which view they were
 * in, and a link to a note can point at one.
 */
import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { ActionBar } from './action-bar';
import { AskDialog } from './ask-dialog';
import { EditView } from './edit-view';
import { ExportControls } from './export-controls';
import { IntegrationControls } from './integration-controls';
import { SaveToLibrary } from './save-to-library';
import { ShareControls } from './share-controls';
import { Notice } from '@/lib/app/notice';
import { ReadView } from './read-view';
import { RegenerateDialog } from './regenerate-dialog';
import { StudyView } from './study-view';
import { VersionHistory } from './version-history';
import { acceptBlock, rejectBlock } from '@/lib/notes/provenance';
import { appStrings } from '@/lib/app/strings';
import { hasOriginalContent } from '@/lib/notes/reading';
import { useToast } from '@/components/ui/toast';
import { useWorkspace } from './use-workspace';
import type { AskTarget } from './ask-dialog';
import type { NoteDocument } from '@/lib/ai/schema';
import type { QuotaRefusal } from '@/lib/ai/sse-client';
import type { ReadingMode } from '@/lib/render/reading-mode';
import type { WorkspaceMode } from './action-bar';
import type { LocalNote } from '@/lib/store/types';

const strings = appStrings.workspace;

const MODES = new Set<WorkspaceMode>(['read', 'edit', 'study']);

export function Workspace({
  note,
  document: initial,
  banners,
  onRefused,
}: {
  note: LocalNote;
  document: NoteDocument;
  /** The generation-time banners — partial, degraded, revised, resumable error. */
  banners?: React.ReactNode;
  onRefused: (refusal: QuotaRefusal) => void;
}) {
  const workspace = useWorkspace(note, initial);
  const [mode, setMode] = useUrlMode();
  const [readingMode, setReadingMode] = useState<ReadingMode>('everything');
  const [regenerating, setRegenerating] = useState<{ sectionId: string | null } | null>(null);
  const [asking, setAsking] = useState<AskTarget | null>(null);
  const [history, setHistory] = useState(false);
  const toast = useToast();

  const { apply, doc } = workspace;

  // The first snapshot is the document as it was generated. It is taken on arrival rather than on
  // the first edit, because the point of it is to be the thing an edit can be undone back *to* —
  // and a student's first action on a note they dislike is often "accept all" or "keep only mine",
  // which is exactly the change with no earlier version to return to.
  useEffect(() => {
    if (workspace.versions.length === 0) void workspace.mark('generated', 'Generated');
    // Only ever on arrival; `mark` closes over the current doc and would otherwise re-fire on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accept = useCallback(
    (blockId: string) => apply(acceptBlock(doc, blockId), 'Accepted a change', true),
    [apply, doc],
  );

  const reject = useCallback(
    (blockId: string) => apply(rejectBlock(doc, blockId), 'Rejected a change', true),
    [apply, doc],
  );

  return (
    <main className="mx-auto flex w-full max-w-[76rem] flex-col px-5 py-6">
      <ActionBar
        mode={mode}
        onModeChange={setMode}
        readingMode={readingMode}
        onReadingModeChange={setReadingMode}
        canShowOriginal={hasOriginalContent(doc)}
        saving={workspace.saving}
        edited={workspace.edited}
        canUndo={workspace.canUndo}
        onUndo={workspace.undo}
        onRegenerate={() => setRegenerating({ sectionId: null })}
        onHistory={() => setHistory(true)}
        onUnavailable={(message) => toast({ title: 'Not yet', description: message })}
        exportMenu={<ExportControls note={note} doc={doc} />}
        shareControls={<ShareControls note={note} doc={doc} />}
        saveToLibrary={<SaveToLibrary note={note} />}
      />

      <div className="mx-auto flex w-full max-w-(--note-shell) flex-col gap-4">
        {/* 01-PRODUCT.md §5, "Editor · Offline". Not an error and not a blocker: local autosave is
            how this product works signed-out, so the banner states the fact and moves on. */}
        {workspace.offline ? <Notice tone="info">{strings.offlineBanner}</Notice> : null}
        {banners}
        {readingMode === 'my-original' && !hasOriginalContent(doc) ? (
          <Notice tone="info">{strings.originalEmpty}</Notice>
        ) : null}
      </div>

      {/* Notion and Drive sit under the banners rather than in the action bar: they are a
          destination for a finished note rather than something you do while reading one, and the
          bar is already the busiest row on the page. They render nothing when signed out. */}
      <div className="mx-auto mt-4 w-full max-w-(--note-shell)">
        <IntegrationControls note={note} doc={doc} />
      </div>

      <div className="mt-6">
        {mode === 'read' ? (
          <ReadView
            note={note}
            doc={doc}
            readingMode={readingMode}
            onReadingModeChange={setReadingMode}
          />
        ) : null}

        {mode === 'edit' ? (
          <div className="mx-auto w-full max-w-(--note-shell)">
            <EditView
              doc={doc}
              onApply={apply}
              onAccept={accept}
              onReject={reject}
              onRegenerateSection={(sectionId) => setRegenerating({ sectionId })}
              onAsk={setAsking}
            />
          </div>
        ) : null}

        {mode === 'study' ? <StudyView doc={doc} /> : null}
      </div>

      <RegenerateDialog
        open={regenerating !== null}
        onOpenChange={(open) => setRegenerating(open ? regenerating : null)}
        note={note}
        doc={doc}
        initialSectionId={regenerating?.sectionId ?? null}
        onApply={(next, label) => {
          apply(next, label, true);
          void workspace.mark('regenerated', label);
        }}
        onRefused={onRefused}
      />

      <AskDialog
        target={asking}
        onClose={() => setAsking(null)}
        note={note}
        doc={doc}
        onApply={(next, label) => apply(next, label, true)}
        onRefused={onRefused}
      />

      <VersionHistory
        open={history}
        onOpenChange={setHistory}
        versions={workspace.versions}
        onRestore={workspace.restore}
      />
    </main>
  );
}

/**
 * The view, in the query string.
 *
 * `replace` rather than `push`, so switching between Read and Edit does not build a back-button
 * history a student has to press their way out of to leave the note. The one entry that matters —
 * the note itself — is already there.
 */
function useUrlMode(): [WorkspaceMode, (mode: WorkspaceMode) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get('mode') ?? 'read';
  const mode = (MODES.has(raw as WorkspaceMode) ? raw : 'read') as WorkspaceMode;

  const set = useCallback(
    (next: WorkspaceMode) => {
      const search = new URLSearchParams(params.toString());
      if (next === 'read') search.delete('mode');
      else search.set('mode', next);
      const query = search.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return [mode, set];
}
