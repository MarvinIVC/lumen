'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/toast';
import { AlertTriangleIcon, FileIcon, SparkIcon } from '@/components/ui/icons';
import { ContextEditor } from '@/components/domain/context-editor';
import { ExtractionEditor } from '@/components/domain/extraction-editor';
import { OptionsPanel } from '@/components/domain/options-panel';
import { QuotaMeter } from '@/components/domain/quota-meter';
import { appStrings } from '@/lib/app/strings';
import { APP_REVIEW, newHref, noteHref } from '@/lib/app/routes';
import { useAssetUrls } from '@/lib/app/use-asset-urls';
import { useDraft } from '@/lib/app/use-draft';
import { MAX_CHARS, SOFT_PAGE_LIMIT } from '@/lib/ingest/limits';
import { CAP_MESSAGES } from '@/lib/ingest/limits';
import { assessQuality } from '@/lib/ingest/quality';
import { estimateRun, formatCost, formatCredits, formatDuration } from '@/lib/ingest/estimate';
import { isOcrAvailable, runOcr } from '@/lib/ai/ocr-client';
import { listPacks } from '@/lib/curriculum/load';
import { getAsset } from '@/lib/store/drafts';
import { flushDraft, useDraftStore } from '@/lib/store/draft-store';

/**
 * `/app/review` — the screen that exists to prevent wasted AI calls (01-PRODUCT.md §2 step 3).
 *
 * Two panes. On the left, what we read, editable. On the right, what we think it is and what we
 * are about to do about it. Everything on this screen is free, and it is the last point at which
 * a mistake costs nothing — so the design spends the student's attention here rather than saving
 * it for a generation they will have to throw away.
 */
export function ReviewScreen() {
  const { draft, hydrated } = useDraft(APP_REVIEW);
  const router = useRouter();
  const toast = useToast();

  const updateBlock = useDraftStore((state) => state.setBlockText);
  const deleteBlock = useDraftStore((state) => state.deleteBlock);
  const mergeBlockUp = useDraftStore((state) => state.mergeBlockUp);
  const moveBlock = useDraftStore((state) => state.moveBlock);
  const splitLesson = useDraftStore((state) => state.splitLesson);
  const runDetection = useDraftStore((state) => state.runDetection);
  const setContext = useDraftStore((state) => state.setContext);
  const setNotesLanguage = useDraftStore((state) => state.setNotesLanguage);
  const setOptions = useDraftStore((state) => state.setOptions);
  const createNote = useDraftStore((state) => state.createNote);

  const assetUrl = useAssetUrls(draft?.id ?? null);
  const [packsResolved, setPacksResolved] = useState(false);
  const [oneLesson, setOneLesson] = useState(false);
  const [creating, setCreating] = useState(false);
  const [online, setOnline] = useState(true);

  const draftId = draft?.id ?? null;
  const detectionEdited = draft?.detection.edited ?? false;

  // Detection is the first thing this screen does, before the student can read the pane. It is
  // local and synchronous, so there is no loading state to design around.
  useEffect(() => {
    if (!draftId || detectionEdited) return;
    void runDetection();
  }, [draftId, detectionEdited, runDetection]);

  useEffect(() => {
    void listPacks().then(() => setPacksResolved(true));
  }, []);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  const blocks = useMemo(() => draft?.doc.blocks ?? [], [draft]);
  const quality = useMemo(() => assessQuality(blocks), [blocks]);
  const scans = blocks.filter((block) => block.needsOCR).length;
  const sources = draft?.doc.meta.sourceFiles ?? [];
  const charCount = draft?.doc.meta.charCount ?? 0;
  const pageCount = draft?.doc.meta.pageCount ?? 0;

  const estimate = useMemo(
    () =>
      draft
        ? estimateRun({
            charCount,
            ocrPages: scans,
            language: draft.context.language,
            options: draft.options,
          })
        : null,
    [draft, charCount, scans],
  );

  if (hydrated && blocks.length === 0) {
    return (
      <main className="mx-auto w-full max-w-[56rem] px-5 py-16">
        <EmptyState
          icon={<FileIcon />}
          title={appStrings.review.emptyTitle}
          description={appStrings.review.emptyBody}
          action={
            <Button asChild>
              <Link href={newHref(draft?.id)}>{appStrings.review.emptyCta}</Link>
            </Button>
          }
        />
      </main>
    );
  }

  if (!draft) {
    return (
      <main className="mx-auto w-full max-w-[56rem] px-5 py-16">
        <p className="font-sans text-sm text-text-muted">Opening your draft…</p>
      </main>
    );
  }

  /**
   * "Run OCR (≈ 1 credit)" — the one control on this screen that spends anything.
   *
   * Wired end to end even though `isOcrAvailable()` is false and the button is disabled, so that
   * phase-04 only has to deploy the function and flip that flag. The recognised text arrives as an
   * ordinary editable block, because OCR is never quite right and the correction has to happen
   * here rather than in the study guide.
   */
  const ocr = async (blockId: string) => {
    const block = blocks.find((entry) => entry.id === blockId);
    if (!block?.assetId || !draft) return;

    const inMemory = useDraftStore.getState().assets.get(block.assetId);
    const stored = inMemory ? null : await getAsset(block.assetId);
    const blob =
      inMemory?.blob ?? (stored ? new Blob([stored.bytes], { type: stored.mime }) : null);
    if (!blob) return;

    try {
      const result = await runOcr({
        blob,
        language: draft.notesLanguage,
        turnstileToken: draft.turnstileToken,
      });
      useDraftStore.getState().setBlockText(blockId, result.text, { clearOcr: true });
    } catch {
      toast({ tone: 'danger', title: appStrings.review.ocrFailed });
    }
  };

  const create = async () => {
    setCreating(true);
    try {
      const noteId = await createNote();
      if (!noteId) return;
      await flushDraft();
      toast({ title: appStrings.review.createdToast });
      router.push(noteHref(noteId));
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-[76rem] flex-col gap-6 px-5 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-3xl font-semibold text-text">{appStrings.review.title}</h1>
        <p className="max-w-prose font-sans text-text-muted">{appStrings.review.lead}</p>
      </header>

      <div className="flex flex-col gap-3">
        {!online ? <Notice tone="info">{appStrings.review.offline}</Notice> : null}
        {quality.warn && quality.message ? <Notice tone="warning">{quality.message}</Notice> : null}
        {charCount > MAX_CHARS ? (
          <Notice tone="warning">{appStrings.review.overCap(charCount, MAX_CHARS)}</Notice>
        ) : null}
        {pageCount > SOFT_PAGE_LIMIT ? (
          <Notice tone="warning">{CAP_MESSAGES.manyPages(pageCount)}</Notice>
        ) : null}
        {scans > 0 ? <Notice tone="warning">{appStrings.review.ocrPending(scans)}</Notice> : null}
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="extraction-heading" className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="extraction-heading" className="font-sans text-sm font-medium text-text">
              {appStrings.review.leftHeading}
            </h2>
            <p className="font-sans text-xs text-text-muted">
              {appStrings.review.blockCount(blocks.length)}
            </p>
          </div>

          {sources.length > 1 && !oneLesson ? (
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-bg-sunken px-3 py-2.5">
              <p className="font-sans text-xs text-text-muted">
                {appStrings.review.multiSourceHint(sources.length)}
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setOneLesson(true);
                  toast({ title: appStrings.review.oneLessonDone });
                }}
              >
                {appStrings.review.oneLessonCta}
              </Button>
            </div>
          ) : null}

          <ExtractionEditor
            blocks={blocks}
            assetUrl={assetUrl}
            ocrAvailable={isOcrAvailable()}
            onChangeText={updateBlock}
            onDelete={deleteBlock}
            onMergeUp={mergeBlockUp}
            onMove={moveBlock}
            onRunOcr={(blockId) => void ocr(blockId)}
            onSplit={(index) => {
              void splitLesson(index).then((id) => {
                if (id) toast({ title: appStrings.review.splitDone });
              });
            }}
          />
        </section>

        {/*
          Above the extraction on a narrow screen. Below it, the course fields and the primary
          button sit under forty blocks of notes — a student on a phone would scroll the whole
          lesson before finding out we had guessed their course, which is the one thing this
          screen exists to ask them.
        */}
        <aside className="flex flex-col gap-6 max-lg:order-first lg:sticky lg:top-6 lg:self-start">
          <section aria-labelledby="context-heading" className="flex flex-col gap-3">
            <h2 id="context-heading" className="font-sans text-sm font-medium text-text">
              {appStrings.review.rightHeading}
            </h2>
            <ContextEditor
              context={draft.context}
              notesLanguage={draft.notesLanguage}
              detection={draft.detection}
              onChange={setContext}
              onNotesLanguageChange={setNotesLanguage}
              packName={draft.packName}
              packsResolved={packsResolved}
            />
            {packsResolved && !draft.packName ? (
              <div className="rounded-md border border-border bg-bg-sunken p-3">
                <p className="font-sans text-xs font-medium text-text">
                  {appStrings.review.noPackTitle}
                </p>
                <p className="mt-1 font-sans text-xs leading-snug text-text-muted">
                  {appStrings.review.noPackBody}
                </p>
              </div>
            ) : null}
          </section>

          <Separator />

          <OptionsPanel
            options={draft.options}
            onChange={setOptions}
            {...(estimate
              ? {
                  estimate: {
                    amount: `${formatCredits(estimate.credits)} · ${formatCost(estimate.costCny)}`,
                    duration: formatDuration(estimate.seconds),
                    provisional: true,
                  },
                }
              : {})}
          />

          <Separator />

          <QuotaMeter used={0} total={3} resetsIn="at midnight" />

          <Button
            size="lg"
            fullWidth
            icon={<SparkIcon />}
            loading={creating}
            onClick={() => void create()}
          >
            {appStrings.review.createCta}
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href={newHref(draft.id)}>{appStrings.review.backCta}</Link>
          </Button>
        </aside>
      </div>
    </main>
  );
}

function Notice({ tone, children }: { tone: 'warning' | 'info'; children: React.ReactNode }) {
  return (
    <div
      className={
        tone === 'warning'
          ? 'flex items-start gap-2.5 rounded-md border border-warning/50 bg-verify px-3 py-2.5'
          : 'flex items-start gap-2.5 rounded-md border border-border bg-bg-sunken px-3 py-2.5'
      }
    >
      {tone === 'warning' ? (
        <AlertTriangleIcon aria-hidden="true" className="mt-0.5 shrink-0 text-base text-warning" />
      ) : null}
      <p className="font-sans text-sm leading-snug text-text">{children}</p>
    </div>
  );
}
