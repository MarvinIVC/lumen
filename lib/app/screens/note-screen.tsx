'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FileIcon, SparkIcon } from '@/components/ui/icons';
import { StreamingDoc } from '@/components/domain/streaming-doc';
import { Notice } from '@/lib/app/notice';
import { Workspace } from '@/lib/app/workspace/workspace';
import { appStrings } from '@/lib/app/strings';
import { APP_NEW, APP_SETTINGS, reviewHref } from '@/lib/app/routes';
import { AI_DISCLAIMER } from '@/lib/config';
import { EnhanceRefused, streamEnhance } from '@/lib/ai/enhance-client';
import type { GenerationPhase, QuotaRefusal } from '@/lib/ai/enhance-client';
import { resetsIn } from '@/lib/ai/usage-client';
import { blocksToText } from '@/lib/ingest/normalize';
import { loadNote, saveNote } from '@/lib/store/drafts';
import type { LocalNote } from '@/lib/store/types';
import { PROMPT_VERSION, SCHEMA_VERSION } from '@/lib/ai/versions';
import type { NoteDocument } from '@/lib/ai/schema';

/**
 * `/app/note/:id` — where the study guide arrives (01-PRODUCT.md §2 step 4, 03-DESIGN.md §7).
 *
 * Four states, and the transitions between them are where the care is:
 *
 *   draft       the notes are confirmed and nothing has been spent. Generation starts on arrival
 *               *once* — the note is marked `generating` and persisted before the request goes
 *               out, so a reload cannot start a second paid call.
 *   generating  sections fade in as they land. "Stop" aborts, and what arrived is kept as a
 *               partial draft rather than discarded (04 §7). No credit is charged for it.
 *   ready       the finished document, rendered by the phase-01 renderer.
 *   error       a quota card, a refusal, or a resumable failure — never a stack trace, always
 *               something to do next (01-PRODUCT.md §5).
 *
 * A note left in `generating` by a closed tab does not auto-restart. It offers to, which is the
 * difference between a student choosing to spend a credit and us spending it for them.
 */
export function NoteScreen({ noteId }: { noteId: string }) {
  const [note, setNote] = useState<LocalNote | null | undefined>(undefined);
  const [document, setDocument] = useState<NoteDocument | null>(null);
  const [status, setStatus] = useState<string>(appStrings.generate.starting);
  const [phase, setPhase] = useState<GenerationPhase>('generating');
  const [running, setRunning] = useState(false);
  const [refusal, setRefusal] = useState<QuotaRefusal | null>(null);
  const abort = useRef<AbortController | null>(null);
  // Generation must start at most once per mount, and `note` changing must not be able to
  // retrigger it — this is the guard that keeps a re-render from costing a credit.
  const started = useRef(false);

  useEffect(() => {
    void loadNote(noteId).then((found) => {
      setNote(found);
      if (found?.generated) setDocument(found.generated);
    });
  }, [noteId]);

  const generate = useCallback(async (current: LocalNote) => {
    if (abort.current) return;
    const controller = new AbortController();
    abort.current = controller;
    setRunning(true);
    setRefusal(null);
    setStatus(appStrings.generate.starting);

    // Persisted before the request leaves, so a reload during the call finds `generating` and
    // offers to resume rather than silently starting a second one.
    const opening: LocalNote = { ...current, status: 'generating' };
    delete opening.error;
    delete opening.refusal;
    await saveNote(opening);
    setNote(opening);

    let finished: NoteDocument | null = null;
    let partial: NoteDocument | null = null;
    let failure: LocalNote['error'] | undefined;
    let refused: string | undefined;
    let wasDegraded = false;
    let model: string | undefined;

    try {
      await streamEnhance(
        {
          context: current.context,
          options: current.options,
          extract: blocksToText(current.doc.blocks),
          titleHint: current.title,
          turnstileToken: current.turnstileToken ?? null,
          signal: controller.signal,
        },
        {
          onStatus: (line, next) => {
            setStatus(line);
            setPhase(next);
          },
          onPartial: (draft) => {
            partial = draft;
            setDocument(draft);
          },
          onDocument: (final, degraded) => {
            finished = final;
            wasDegraded = degraded;
            setDocument(final);
          },
          onRefused: (reason) => {
            refused = reason;
          },
          onUsage: (spent) => {
            model = spent.model;
          },
          onError: (error) => {
            failure = error;
          },
        },
      );
    } catch (cause) {
      if (cause instanceof EnhanceRefused) {
        setRefusal(cause.refusal);
        // Nothing was spent and nothing was started: the note goes back to being a draft so the
        // student can try again tomorrow, or with their own key, without re-uploading anything.
        const reverted: LocalNote = { ...opening, status: 'draft' };
        await saveNote(reverted);
        setNote(reverted);
        setRunning(false);
        abort.current = null;
        return;
      }
      failure = {
        code: 'network',
        message: 'We lost the connection part-way. Your notes are safe on this device.',
        resumable: true,
      };
    }

    const cancelled = controller.signal.aborted;
    const document_ = finished ?? partial;
    const saved: LocalNote = {
      ...opening,
      status: finished && !cancelled ? 'ready' : refused || failure ? 'error' : 'draft',
      ...(document_ ? { generated: document_ } : {}),
      partial: Boolean(!finished && document_),
      ...(refused ? { refusal: refused } : {}),
      ...(failure ? { error: failure } : {}),
      ...(model ? { model } : {}),
      // The note meta line says when this was rebuilt (06 §5.7), and `createdAt` is when the
      // *draft* was made — often a different day from the day a student finally pressed the button.
      ...(document_ ? { generatedAt: Date.now() } : {}),
      degraded: wasDegraded,
    };
    await saveNote(saved);
    setNote(saved);
    setRunning(false);
    abort.current = null;
  }, []);

  useEffect(() => {
    if (!note || started.current) return;
    if (note.status !== 'draft' || note.generated) return;
    started.current = true;
    void generate(note);
  }, [note, generate]);

  useEffect(() => () => abort.current?.abort(), []);

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

  const retry = () => {
    started.current = true;
    void generate({ ...note, status: 'draft' });
  };

  /* Streaming ------------------------------------------------------------- */
  if (running) {
    return (
      <main className="mx-auto w-full max-w-[76rem] px-5 py-6">
        <StreamingDoc
          doc={document ?? emptyFor(note)}
          status={status}
          done={phase === 'finalising'}
        />
        <div className="mt-8 flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              abort.current?.abort();
            }}
          >
            {appStrings.generate.cancel}
          </Button>
        </div>
      </main>
    );
  }

  /* Refused by a guardrail before anything ran ---------------------------- */
  if (refusal) {
    return (
      <main className="mx-auto w-full max-w-[42rem] px-5 py-16">
        <QuotaCard refusal={refusal} onRetry={retry} />
      </main>
    );
  }

  /* Refused by the model -------------------------------------------------- */
  if (note.refusal) {
    return (
      <main className="mx-auto flex w-full max-w-[42rem] flex-col gap-4 px-5 py-16">
        <h1 className="font-serif text-2xl font-semibold text-text">
          {appStrings.generate.refusedTitle}
        </h1>
        <p className="max-w-prose font-sans text-sm leading-relaxed text-text-muted">
          {appStrings.generate.refusedBody}
        </p>
        <Notice tone="info">{appStrings.generate.refusedReason(note.refusal)}</Notice>
        <p className="font-sans text-sm text-text-muted">{appStrings.generate.refusedFree}</p>
        <div>
          <Button asChild variant="secondary">
            <Link href={APP_NEW}>{appStrings.generate.refusedCta}</Link>
          </Button>
        </div>
      </main>
    );
  }

  /* The document, finished or partial ------------------------------------- */
  if (document) {
    // Everything above the document is generation-time news — a partial run, a degraded result, a
    // second check that changed several things, a failure that can be resumed. It is handed to the
    // workspace rather than rendered around it, so it sits under the sticky action bar with the
    // offline banner instead of scrolling away above it.
    const banners = (
      <>
        {note.partial ? (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-warning/50 bg-verify px-3 py-2.5">
            <p className="font-sans text-sm leading-snug text-text">
              {appStrings.generate.partialBanner}
            </p>
            {/* A partial note with no way to finish it is a dead end — that is what a student
                  saw every time they pressed Stop. The button lives here only when there is no
                  error row below, which carries its own; two identical buttons is its own bug. */}
            {note.error ? null : (
              <Button size="sm" variant="secondary" onClick={retry}>
                {appStrings.generate.resumeCta}
              </Button>
            )}
          </div>
        ) : null}
        {note.degraded ? (
          <Notice tone="warning">{appStrings.generate.degradedBanner}</Notice>
        ) : null}
        {document.factCheck.verdict === 'significant-fixes' ? (
          <Notice tone="accent">{appStrings.generate.revisedBanner}</Notice>
        ) : null}
        {note.error ? (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-bg-sunken px-3 py-2.5">
            <p className="font-sans text-sm text-text">{note.error.message}</p>
            {note.error.resumable ? (
              <Button size="sm" variant="secondary" onClick={retry}>
                {appStrings.generate.errorRetry}
              </Button>
            ) : null}
          </div>
        ) : null}
      </>
    );

    return <Workspace note={note} document={document} banners={banners} onRefused={setRefusal} />;
  }

  /* Nothing generated yet ------------------------------------------------- */
  return (
    <main className="mx-auto flex w-full max-w-[48rem] flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-3">
        <h1 className="font-serif text-3xl font-semibold text-text">{note.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {note.context.course ? <Badge tone="accent">{note.context.course}</Badge> : null}
          {note.context.unit ? <Badge>{note.context.unit}</Badge> : null}
          <Badge>{note.context.language.toUpperCase()}</Badge>
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
              {note.status === 'generating'
                ? appStrings.generate.resumeBody
                : appStrings.note.readyBody}
            </p>
            {note.error ? <Notice tone="warning">{note.error.message}</Notice> : null}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon={<SparkIcon />} onClick={retry}>
                {note.status === 'generating'
                  ? appStrings.generate.resumeCta
                  : appStrings.note.startCta}
              </Button>
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

/** A document shell so the streaming view has a title and context before anything has landed. */
function emptyFor(note: LocalNote): NoteDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    promptVersion: PROMPT_VERSION,
    title: note.title,
    context: note.context,
    options: note.options,
    summary: '',
    objectives: [],
    sections: [],
    corrections: [],
    openQuestions: [],
    factCheck: { calculationsVerified: [], checkedClaims: 0, flags: [] },
    studyTools: { flashcards: [], quiz: [] },
    glossary: [],
  };
}

/**
 * The quota / community-limit / paused card (01-PRODUCT.md §5).
 *
 * Every one of these says the same three things, because they are the three things a student
 * needs: what happened, when it stops being true, and what they can do in the meantime. The two
 * offers — their own key, and a finished example — are the ones that actually help at that moment.
 */
function QuotaCard({ refusal, onRetry }: { refusal: QuotaRefusal; onRetry: () => void }) {
  const paused = refusal.reason === 'kill-switch';
  const community = refusal.reason === 'daily-cap' || refusal.reason === 'monthly-cap';
  // Anything that is not a refusal we recognise is a service we could not reach. Telling a
  // student they have used their allowance when the backend simply did not answer is worse than
  // an error message: it is wrong about their own account, and they cannot check it.
  const unreachable = refusal.reason === 'unavailable' || refusal.reason === 'rate-limited';
  const resets = resetsIn(refusal.resetsAt);

  const title = paused
    ? appStrings.generate.pausedTitle
    : community
      ? appStrings.generate.capTitle
      : unreachable
        ? appStrings.generate.unreachableTitle
        : appStrings.generate.quotaTitle;

  const body = paused
    ? appStrings.generate.pausedBody
    : community
      ? appStrings.generate.capBody
      : unreachable
        ? refusal.message
        : resets
          ? appStrings.generate.quotaBody(resets)
          : appStrings.generate.quotaBodyNoReset;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-serif text-2xl font-semibold text-text">{title}</h1>
      <p className="max-w-prose font-sans text-sm leading-relaxed text-text-muted">{body}</p>

      {refusal.byokHelps ? (
        <div className="flex flex-col gap-4 rounded-md border border-border bg-bg-raised p-5">
          <div className="flex flex-col gap-1">
            <Button asChild size="sm" className="self-start">
              <Link href={APP_SETTINGS}>{appStrings.generate.quotaKeyCta}</Link>
            </Button>
            <p className="font-sans text-xs text-text-muted">{appStrings.generate.quotaKeyHint}</p>
          </div>
          <div className="flex flex-col gap-1">
            <Button asChild size="sm" variant="secondary" className="self-start">
              <Link href="/how-it-works#real-lesson">{appStrings.generate.quotaSampleCta}</Link>
            </Button>
            <p className="font-sans text-xs text-text-muted">
              {appStrings.generate.quotaSampleHint}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={onRetry}>
          {appStrings.generate.errorRetry}
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link href={APP_NEW}>{appStrings.note.missingCta}</Link>
        </Button>
      </div>
    </div>
  );
}
