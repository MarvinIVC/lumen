'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FileIcon, SparkIcon } from '@/components/ui/icons';
import { appStrings } from '@/lib/app/strings';
import { APP_NEW, reviewHref } from '@/lib/app/routes';
import { AI_DISCLAIMER } from '@/lib/config';
import { loadNote } from '@/lib/store/drafts';
import type { LocalNote } from '@/lib/store/types';

/**
 * `/app/note/:id` in its `draft` state (01-PRODUCT.md §2 step 4).
 *
 * Phase-04 turns this into the streaming view. Until then it is the honest end of the phase-03
 * flow: the notes are read, the context is confirmed, the options are chosen, and all of it is
 * saved on this device. Saying that plainly is better than a fake progress bar.
 */
export function NoteScreen({ noteId }: { noteId: string }) {
  const [note, setNote] = useState<LocalNote | null | undefined>(undefined);

  useEffect(() => {
    void loadNote(noteId).then((found) => setNote(found));
  }, [noteId]);

  if (note === undefined) {
    return (
      <main className="mx-auto w-full max-w-[48rem] px-5 py-16">
        <p className="font-sans text-sm text-text-muted">Looking on this device…</p>
      </main>
    );
  }

  if (note === null) {
    return (
      <main className="mx-auto w-full max-w-[48rem] px-5 py-16">
        <EmptyState
          icon={<FileIcon />}
          title={appStrings.note.missingTitle}
          description={appStrings.note.missingBody}
          action={
            <Button asChild>
              <Link href={APP_NEW}>{appStrings.note.missingCta}</Link>
            </Button>
          }
        />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-[48rem] flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-3">
        <h1 className="font-serif text-3xl font-semibold text-text">{note.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {note.context.course ? <Badge tone="accent">{note.context.course}</Badge> : null}
          {note.context.unit ? <Badge>{note.context.unit}</Badge> : null}
          <Badge>{note.context.language.toUpperCase()}</Badge>
          <Badge tone="warning">{appStrings.note.readyTitle}</Badge>
        </div>
        <p className="font-sans text-xs text-text-muted">
          {appStrings.note.sourceLine(note.source.filenames.length, note.source.extractedCharCount)}
        </p>
      </header>

      <div className="rounded-md border border-border bg-bg-raised p-5">
        <div className="flex items-start gap-3">
          <SparkIcon aria-hidden="true" className="mt-0.5 text-lg text-accent" />
          <div className="flex flex-col gap-3">
            <p className="max-w-prose font-sans text-sm leading-snug text-text">
              {appStrings.note.readyBody}
            </p>
            <div>
              <Button asChild size="sm" variant="secondary">
                <Link href={reviewHref(note.draftId)}>{appStrings.note.backToReview}</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <p className="font-sans text-xs text-text-muted">{AI_DISCLAIMER}</p>
    </main>
  );
}
