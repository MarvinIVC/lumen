'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { FileIcon, PlusIcon, SparkIcon } from '@/components/ui/icons';
import { Notice } from '@/lib/app/notice';
import { appStrings } from '@/lib/app/strings';
import { APP_NEW, noteHref, reviewHref } from '@/lib/app/routes';
import { deleteDraft, listDrafts, listNotes } from '@/lib/store/drafts';
import type { LocalDraft, LocalNote } from '@/lib/store/types';

/**
 * `/app` — the workspace, and for phase-03 the "resume draft" entry point the DoD asks for.
 *
 * The library proper is phase-05. What this has to do now is make an interrupted ingestion
 * findable: a student who closed the tab halfway through fixing a scan should not have to
 * remember a URL. Drafts are listed newest first, straight out of IndexedDB.
 */
export function HubScreen() {
  const [drafts, setDrafts] = useState<LocalDraft[] | null>(null);
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [signInFailed, setSignInFailed] = useState(false);
  const toast = useToast();

  const refresh = useCallback(async () => {
    const [nextDrafts, nextNotes] = await Promise.all([listDrafts(), listNotes()]);
    // A draft with nothing in it is an artefact of opening /app/new and leaving; it is not work,
    // and listing it would make the resume list mostly noise.
    setDrafts(nextDrafts.filter((draft) => draft.doc.blocks.length > 0));
    setNotes(nextNotes);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Where an expired or reused sign-in link lands.
   *
   * `/auth/callback` and `/auth/confirm` cannot render anything themselves — they are redirects —
   * so they send the student here with `?auth=failed`. Without this the link silently drops them
   * on the workspace signed out, which reads as "it worked" until they look for their library.
   * The parameter is stripped once it has been said, so a reload does not repeat it.
   */
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('auth') !== 'failed') return;
    setSignInFailed(true);
    const url = new URL(window.location.href);
    url.searchParams.delete('auth');
    window.history.replaceState(null, '', url.toString());
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-[56rem] flex-col gap-10 px-5 py-10">
      {signInFailed ? <Notice tone="warning">{appStrings.auth.callbackFailed}</Notice> : null}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-text">{appStrings.hub.title}</h1>
          <p className="mt-2 max-w-prose font-sans text-text-muted">{appStrings.hub.lead}</p>
        </div>
        <Button asChild size="lg" icon={<PlusIcon />}>
          <Link href={APP_NEW}>{appStrings.hub.newCta}</Link>
        </Button>
      </header>

      <section aria-labelledby="resume-heading" className="flex flex-col gap-3">
        <h2 id="resume-heading" className="font-sans text-sm font-medium text-text">
          {appStrings.hub.resumeHeading}
        </h2>

        {drafts === null ? (
          <p className="font-sans text-sm text-text-muted">Looking on this device…</p>
        ) : drafts.length === 0 ? (
          <EmptyState
            icon={<FileIcon />}
            title={appStrings.hub.resumeEmptyTitle}
            description={appStrings.hub.resumeEmptyBody}
            action={
              <Button asChild>
                <Link href={APP_NEW}>{appStrings.hub.newCta}</Link>
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {drafts.map((draft) => (
              <li key={draft.id}>
                <Card className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-sans text-sm font-medium text-text">
                      {draft.title || 'Untitled notes'}
                    </p>
                    <p className="font-sans text-xs text-text-muted">
                      {appStrings.hub.draftMeta(
                        draft.doc.blocks.length,
                        draft.doc.meta.sourceFiles.length,
                      )}
                      {' · '}
                      {new Date(draft.updatedAt).toLocaleDateString('en')}
                    </p>
                  </div>
                  <Button asChild size="sm">
                    <Link href={reviewHref(draft.id)}>{appStrings.hub.continueCta}</Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void deleteDraft(draft.id).then(() => {
                        toast({ title: appStrings.hub.discarded });
                        void refresh();
                      });
                    }}
                  >
                    {appStrings.hub.discard}
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {notes.length > 0 ? (
        <section aria-labelledby="notes-heading" className="flex flex-col gap-3">
          <h2 id="notes-heading" className="font-sans text-sm font-medium text-text">
            {appStrings.hub.notesHeading}
          </h2>
          <ul className="flex flex-col gap-2">
            {notes.map((note) => (
              <li key={note.id}>
                <Card className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-sans text-sm font-medium text-text">{note.title}</p>
                    <p className="font-sans text-xs text-text-muted">
                      {[note.context.course, note.context.unit].filter(Boolean).join(' · ') ||
                        'No course set'}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="secondary" icon={<SparkIcon />}>
                    <Link href={noteHref(note.id)}>Open</Link>
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
