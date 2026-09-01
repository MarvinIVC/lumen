'use client';

/**
 * "Ask about this" (phase-05 §11).
 *
 * Select a passage, ask a question, read the answer, and then — separately, afterwards — decide
 * whether it belongs in the note. The separation is the design: this is the one call in the
 * product whose most common outcome is "thanks, that clears it up" with no edit at all, and an
 * answer that inserted itself would turn a question into a change the student has to undo.
 *
 * The two insert shapes match what the answer actually is. A margin note is for the aside that
 * explains something in passing — which is what a two-sentence answer usually is, and what 03 §6
 * built the margin column for. A paragraph is for the one that belongs in the argument.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Notice } from '@/lib/app/notice';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { appStrings } from '@/lib/app/strings';
import { insertBlock } from '@/lib/notes/patch';
import { newBlockId } from '@/lib/notes/identity';
import { readByok } from '@/lib/ai/byok-store';
import { renderInline } from '@/lib/render/markdown/inline';
import { streamAsk } from '@/lib/ai/ask-client';
import { EnhanceRefused } from '@/lib/ai/sse-client';
import type { Block, NoteDocument } from '@/lib/ai/schema';
import type { QuotaRefusal } from '@/lib/ai/sse-client';
import type { LocalNote } from '@/lib/store/types';

const strings = appStrings.workspace;

export interface AskTarget {
  /** The text the student highlighted. */
  selection: string;
  /** Where to put an answer they decide to keep. */
  sectionId: string;
  afterBlockId: string | null;
  /** The surrounding section as plain text, for context the selection alone does not carry. */
  sectionText: string;
}

export function AskDialog({
  target,
  onClose,
  note,
  doc,
  onApply,
  onRefused,
}: {
  target: AskTarget | null;
  onClose: () => void;
  note: LocalNote;
  doc: NoteDocument;
  onApply: (next: NoteDocument, label: string) => void;
  onRefused: (refusal: QuotaRefusal) => void;
}) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!target) return;
    setQuestion('');
    setAnswer('');
    setFailure(null);
    setRunning(false);
  }, [target]);

  useEffect(() => () => abort.current?.abort(), []);

  const ask = useCallback(async () => {
    if (!target || !question.trim()) return;
    const controller = new AbortController();
    abort.current = controller;
    setRunning(true);
    setFailure(null);
    setAnswer('');

    try {
      await streamAsk(
        {
          selection: target.selection,
          question,
          sectionText: target.sectionText,
          course: doc.context.course,
          curriculum: doc.context.curriculum,
          language: doc.context.language,
          turnstileToken: note.turnstileToken ?? null,
          signal: controller.signal,
        },
        {
          // The deltas land straight in the box. It is two sentences; a skeleton would be on
          // screen for less time than it took to draw.
          onDelta: (text) => setAnswer((current) => current + text),
          onAnswer: setAnswer,
          onError: (error) => setFailure(error.message),
        },
      );
    } catch (cause) {
      if (cause instanceof EnhanceRefused) {
        onClose();
        onRefused(cause.refusal);
        return;
      }
      setFailure('We could not reach the service just now. Try again in a moment.');
    } finally {
      setRunning(false);
      abort.current = null;
    }
  }, [doc, note, onClose, onRefused, question, target]);

  const insert = (kind: 'margin' | 'paragraph') => {
    if (!target || !answer.trim()) return;
    const block: Block =
      kind === 'margin'
        ? {
            type: 'marginNote',
            kind: 'connection',
            text: answer.trim(),
            origin: 'ai-added',
            id: newBlockId(doc, target.sectionId),
            ...(target.afterBlockId ? { anchorId: target.afterBlockId } : {}),
          }
        : {
            type: 'paragraph',
            text: answer.trim(),
            origin: 'ai-added',
            id: newBlockId(doc, target.sectionId),
          };

    onApply(
      insertBlock(doc, target.sectionId, block, target.afterBlockId),
      'Added an answer to a question',
    );
    onClose();
  };

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          abort.current?.abort();
          onClose();
        }
      }}
    >
      <DialogContent
        title={strings.askTitle}
        description="We answer about the passage you selected, at your course's level."
        size="md"
        // Focus belongs in the question box: the student opened this dialog with a passage already
        // chosen and exactly one thing left to do. Radix's own focus hook rather than `autoFocus`,
        // which fires before the dialog's focus trap has settled and fights it.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          box.current?.focus();
        }}
        footer={
          answer && !running ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                {strings.askDismiss}
              </Button>
              <Button variant="secondary" onClick={() => insert('paragraph')}>
                {strings.askInsertParagraph}
              </Button>
              <Button onClick={() => insert('margin')}>{strings.askInsertMargin}</Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-sans text-xs text-text-muted">
                {readByok() ? strings.regenCostFree : strings.regenCost}
              </p>
              <Button onClick={() => void ask()} disabled={running || !question.trim()}>
                {strings.askTitle}
              </Button>
            </div>
          )
        }
      >
        <div className="flex flex-col gap-4">
          <blockquote className="border-l-2 border-accent pl-3 font-serif text-sm leading-note text-text-muted">
            {target?.selection}
          </blockquote>

          <Field label="Your question" labelHidden>
            <Textarea
              ref={box}
              rows={2}
              value={question}
              disabled={running}
              placeholder={strings.askPlaceholder}
              onChange={(event) => setQuestion(event.target.value)}
            />
          </Field>

          {running && !answer ? (
            <p className="flex items-center gap-2 font-sans text-sm text-text-muted">
              <Spinner /> {strings.askRunning}
            </p>
          ) : null}

          {answer ? (
            <div className="rounded-note border-l-2 border-ai-added-rule bg-ai-added/50 px-4 py-3">
              <p className="leading-note text-text">{renderInline(answer, 'ask-answer')}</p>
            </div>
          ) : null}

          {failure ? <Notice tone="warning">{failure}</Notice> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
