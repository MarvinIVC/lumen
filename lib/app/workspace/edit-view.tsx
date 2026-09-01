'use client';

/**
 * Edit view (phase-05 §8–§13): the bulk review controls, and the editor under them.
 *
 * The editor itself is loaded on demand. TipTap and ProseMirror are a few hundred kilobytes that a
 * student who only ever reads their note should never download, and `next/dynamic({ ssr: false })`
 * is also what keeps them out of the server compilation the Cloudflare Worker is built from — see
 * the alias list in `next.config.ts`.
 *
 * The three bulk actions are the ones 01-PRODUCT.md §2 step 6 names, and they are three genuinely
 * different intentions rather than a set of buttons:
 *
 *   Accept all          "this is good, it is mine now" — the common case for a note that came back
 *                       well, and the one that makes the provenance marks stop being visual noise.
 *   Keep only mine      "show me what I actually wrote" made permanent.
 *   Review each change  neither — a queue through every AI block in reading order, one decision at
 *                       a time, which is the only one of the three that teaches the student
 *                       anything about their own notes.
 */
import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';

import { Button } from '@/components/ui/button';
import { CheckIcon, ChevronRightIcon, XIcon } from '@/components/ui/icons';
import { Notice } from '@/lib/app/notice';
import { Skeleton } from '@/components/ui/skeleton';
import { acceptAll, keepOnlyMine, pendingAiBlocks } from '@/lib/notes/provenance';
import { appStrings } from '@/lib/app/strings';
import type { NoteDocument } from '@/lib/ai/schema';
import type { AskTarget } from './ask-dialog';

const strings = appStrings.workspace;

const EditorView = dynamic(() => import('@/lib/editor/editor-view'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col gap-3" aria-label="Opening the editor">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  ),
});

export function EditView({
  doc,
  onApply,
  onAccept,
  onReject,
  onRegenerateSection,
  onAsk,
}: {
  doc: NoteDocument;
  onApply: (next: NoteDocument, label: string, immediate?: boolean) => void;
  onAccept: (blockId: string) => void;
  onReject: (blockId: string) => void;
  onRegenerateSection: (sectionId: string) => void;
  onAsk: (target: AskTarget) => void;
}) {
  const pending = useMemo(() => pendingAiBlocks(doc), [doc]);
  const [reviewing, setReviewing] = useState(false);
  const [cursor, setCursor] = useState(0);

  // Accepting or rejecting shortens the queue under the cursor, so the next item slides into the
  // same index. Clamping here is what stops the queue running off the end after the last decision.
  useEffect(() => {
    if (cursor >= pending.length) setCursor(Math.max(0, pending.length - 1));
  }, [cursor, pending.length]);

  const current = reviewing ? pending[cursor] : undefined;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg-raised px-3 py-2">
        <Button
          size="sm"
          variant="secondary"
          icon={<CheckIcon />}
          disabled={pending.length === 0}
          onClick={() => onApply(acceptAll(doc), 'Accepted every AI change', true)}
        >
          {strings.acceptAll}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<XIcon />}
          disabled={pending.length === 0}
          onClick={() => onApply(keepOnlyMine(doc), 'Kept only your own content', true)}
        >
          {strings.keepOnlyMine}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<ChevronRightIcon />}
          disabled={pending.length === 0}
          onClick={() => {
            setReviewing(true);
            setCursor(0);
          }}
        >
          {strings.reviewAi}
        </Button>

        <p aria-live="polite" className="ml-auto font-sans text-xs text-text-muted">
          {pending.length === 0 ? strings.reviewDone : `${pending.length} to review`}
        </p>
      </div>

      {pending.length === 0 && !reviewing ? (
        <Notice tone="info">{strings.nothingToReview}</Notice>
      ) : null}

      {reviewing && current ? (
        <ReviewStrip
          index={cursor}
          total={pending.length}
          onAccept={() => onAccept(current.id ?? '')}
          onReject={() => onReject(current.id ?? '')}
          onSkip={() => setCursor((value) => Math.min(value + 1, pending.length - 1))}
          onDone={() => setReviewing(false)}
        />
      ) : null}

      <EditorView
        doc={doc}
        onDocChange={onApply}
        onAccept={onAccept}
        onReject={onReject}
        onRegenerateSection={onRegenerateSection}
        onAsk={(selection, sectionId, afterBlockId) =>
          onAsk({
            selection,
            sectionId,
            afterBlockId,
            sectionText: sectionTextOf(doc, sectionId),
          })
        }
        focusBlockId={current?.id ?? null}
      />
    </div>
  );
}

/**
 * The review queue's controls, as a strip rather than a modal.
 *
 * The block being decided on is scrolled into view in the editor below, and a dialog over the top
 * of it would hide the thing the decision is about. Skip is not a decision — it leaves the block
 * marked and moves on, which is what a student who wants to think about one does.
 */
function ReviewStrip({
  index,
  total,
  onAccept,
  onReject,
  onSkip,
  onDone,
}: {
  index: number;
  total: number;
  onAccept: () => void;
  onReject: () => void;
  onSkip: () => void;
  onDone: () => void;
}) {
  return (
    <div className="sticky top-28 z-20 flex flex-wrap items-center gap-2 rounded-md border border-accent/40 bg-accent-weak px-3 py-2">
      <p aria-live="polite" className="font-sans text-sm text-text">
        {strings.reviewProgress(index, total)}
      </p>
      <div className="ml-auto flex gap-2">
        <Button size="sm" icon={<CheckIcon />} onClick={onAccept}>
          {strings.accept}
        </Button>
        <Button size="sm" variant="secondary" icon={<XIcon />} onClick={onReject}>
          {strings.reject}
        </Button>
        <Button size="sm" variant="ghost" onClick={onSkip}>
          Skip
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

/** The section around a selection, as plain text — the context "ask about this" sends. */
function sectionTextOf(doc: NoteDocument, sectionId: string): string {
  const section = doc.sections.find((candidate) => candidate.id === sectionId);
  if (!section) return '';
  return [
    section.title,
    ...section.blocks.map((block) =>
      block.type === 'paragraph'
        ? block.text
        : block.type === 'list'
          ? block.items.join('\n')
          : block.type === 'definition'
            ? `${block.term}: ${block.definition}`
            : '',
    ),
  ]
    .filter(Boolean)
    .join('\n');
}
