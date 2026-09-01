'use client';

/**
 * Read view (phase-05 §1–§7) — the default, and the screen the phase is judged on.
 *
 * Almost all of it is the phase-01 renderer, which is the point: `NoteDocument` was built as a
 * pure function of a document precisely so that the read view, the streaming view, the share page
 * and the print route could be the same component. What this adds is the two things a renderer
 * cannot know — which document to draw (the stored one, migrated) and the meta line about where it
 * came from.
 */
import { NoteDocument as NoteDocumentView } from '@/lib/render/NoteDocument';
import { AI_DISCLAIMER } from '@/lib/config';
import { appStrings } from '@/lib/app/strings';
import type { NoteDocument } from '@/lib/ai/schema';
import type { ReadingMode } from '@/lib/render/reading-mode';
import type { LocalNote } from '@/lib/store/types';

const strings = appStrings.workspace;

const MODE_LABEL: Record<string, string> = {
  tidy: 'Tidy',
  complete: 'Complete',
  study_guide: 'Study guide',
};

export function ReadView({
  note,
  doc,
  readingMode,
  onReadingModeChange,
}: {
  note: LocalNote;
  doc: NoteDocument;
  readingMode: ReadingMode;
  onReadingModeChange: (mode: ReadingMode) => void;
}) {
  return (
    <>
      <NoteDocumentView
        doc={doc}
        mode={readingMode}
        onModeChange={onReadingModeChange}
        className="px-0 py-0"
      />
      <NoteMeta note={note} doc={doc} />
    </>
  );
}

/**
 * Which model made this, when, and in what mode (06 §5.7).
 *
 * "Model transparency" in the spec, and it earns its line: a student comparing two notes needs to
 * know whether the difference is their notes or ours, and a note made on their own key should say
 * so. `generatedAt` falls back to the note's creation time for documents made before phase-05
 * started recording it — an approximate date is more use than none.
 */
function NoteMeta({ note, doc }: { note: LocalNote; doc: NoteDocument }) {
  const when = new Date(note.generatedAt ?? note.createdAt).toLocaleDateString('en', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const mode = MODE_LABEL[doc.options.mode] ?? doc.options.mode;

  return (
    <footer className="mx-auto mt-10 flex w-full max-w-(--measure) flex-col gap-2 border-t border-border pt-4">
      <p className="font-sans text-xs text-text-muted">
        {note.model ? strings.meta(note.model, when, mode) : strings.metaNoModel(when, mode)}
      </p>
      <p className="font-sans text-xs leading-snug text-text-muted">{AI_DISCLAIMER}</p>
    </footer>
  );
}
