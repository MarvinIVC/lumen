'use client';

/**
 * "Regenerate this section" (phase-05 §10).
 *
 * Three states in one dialog: pick a section and say what to change, watch it run, then read the
 * diff and decide. The third is the one that matters. A regenerate costs a quarter of a credit and
 * replaces text the student has already read — applying it on arrival would make the button a
 * gamble, and would make "it was better before" unrecoverable without version history.
 *
 * Every failure path ends the same way: the section they had is still on screen, untouched
 * (01-PRODUCT.md §5, "regenerate failure keeps the original"). Nothing here writes to the document
 * except the apply button.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Notice } from '@/lib/app/notice';
import { RenderBlock } from '@/lib/render/blocks';
import { Select, SelectItem } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { appStrings } from '@/lib/app/strings';
import { blocksToText } from '@/lib/ingest/normalize';
import { cn } from '@/lib/utils/cn';
import { diffSection } from '@/lib/notes/diff';
import { readByok } from '@/lib/ai/byok-store';
import { replaceSection } from '@/lib/notes/patch';
import { streamRegenerate } from '@/lib/ai/regen-client';
import { EnhanceRefused } from '@/lib/ai/sse-client';
import type { NoteDocument, Section } from '@/lib/ai/schema';
import type { QuotaRefusal } from '@/lib/ai/sse-client';
import type { RegenFragment } from '@/lib/ai/regen';
import type { SectionDiff } from '@/lib/notes/diff';
import type { LocalNote } from '@/lib/store/types';

const strings = appStrings.workspace;

export function RegenerateDialog({
  open,
  onOpenChange,
  note,
  doc,
  initialSectionId,
  onApply,
  onRefused,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note: LocalNote;
  doc: NoteDocument;
  /** Pre-selected when the student came from a block rather than from the menu. */
  initialSectionId?: string | null;
  onApply: (next: NoteDocument, label: string) => void;
  onRefused: (refusal: QuotaRefusal) => void;
}) {
  const [sectionId, setSectionId] = useState(initialSectionId ?? doc.sections[0]?.id ?? '');
  const [instruction, setInstruction] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [result, setResult] = useState<{ fragment: RegenFragment; diff: SectionDiff } | null>(null);
  const abort = useRef<AbortController | null>(null);

  const section = doc.sections.find((candidate) => candidate.id === sectionId);
  const running = status !== null;

  // Reopening after a run must not show the previous run's diff, and coming from a block must
  // select that block's section rather than whichever one was chosen last time.
  useEffect(() => {
    if (!open) return;
    setStatus(null);
    setFailure(null);
    setResult(null);
    setInstruction('');
    if (initialSectionId) setSectionId(initialSectionId);
  }, [open, initialSectionId]);

  useEffect(() => () => abort.current?.abort(), []);

  const run = useCallback(async () => {
    if (!section) return;
    const controller = new AbortController();
    abort.current = controller;
    setFailure(null);
    setResult(null);
    setStatus(strings.regenRunning);

    try {
      await streamRegenerate(
        {
          context: doc.context,
          options: doc.options,
          extract: blocksToText(note.doc.blocks),
          section,
          ...(instruction.trim() ? { instruction } : {}),
          turnstileToken: note.turnstileToken ?? null,
          signal: controller.signal,
        },
        {
          onStatus: setStatus,
          onFragment: (fragment) =>
            setResult({ fragment, diff: diffSection(section, fragment.section) }),
          onError: (error) => setFailure(error.message),
        },
      );
    } catch (cause) {
      if (cause instanceof EnhanceRefused) {
        onOpenChange(false);
        onRefused(cause.refusal);
        return;
      }
      setFailure(strings.regenKeptOriginal);
    } finally {
      setStatus(null);
      abort.current = null;
    }
  }, [doc, instruction, note, onOpenChange, onRefused, section]);

  const apply = () => {
    if (!result || !section) return;
    onApply(
      replaceSection(doc, section.id, result.fragment.section, {
        corrections: result.fragment.corrections,
        openQuestions: result.fragment.openQuestions,
        glossary: result.fragment.glossary,
      }),
      `Rewrote “${section.title}”`,
    );
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) abort.current?.abort();
        onOpenChange(next);
      }}
    >
      <DialogContent
        title={strings.regenTitle}
        description={strings.regenBody}
        size="lg"
        footer={
          result ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                {strings.regenDiscard}
              </Button>
              <Button onClick={apply} disabled={result.diff.identical}>
                {strings.regenApply}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-sans text-xs text-text-muted">
                {readByok() ? strings.regenCostFree : strings.regenCost}
              </p>
              <Button onClick={() => void run()} disabled={running || !section}>
                {strings.regenerate}
              </Button>
            </div>
          )
        }
      >
        <div className="flex flex-col gap-4">
          {result ? null : (
            <>
              <Field label="Section" hint="Only this section is rewritten.">
                <Select value={sectionId} onValueChange={setSectionId} disabled={running}>
                  {doc.sections.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {candidate.title}
                    </SelectItem>
                  ))}
                </Select>
              </Field>

              <Field
                label="What should change?"
                hint="Optional — leave it empty for a plain rewrite."
              >
                <Textarea
                  rows={3}
                  value={instruction}
                  disabled={running}
                  placeholder={strings.regenPlaceholder}
                  onChange={(event) => setInstruction(event.target.value)}
                />
              </Field>
            </>
          )}

          {running ? (
            <p className="flex items-center gap-2 font-sans text-sm text-text-muted">
              <Spinner /> {status}
            </p>
          ) : null}

          {failure ? <Notice tone="warning">{failure}</Notice> : null}

          {result ? (
            result.diff.identical ? (
              <Notice tone="info">{strings.regenUnchanged}</Notice>
            ) : (
              <Diff diff={result.diff} />
            )
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The before/after, block by block.
 *
 * Rendered with the real block renderer rather than as JSON or as plain text: a student judging
 * whether a rewritten worked example is better needs to see the worked example, with its maths
 * typeset, not a diff of its source. The gutter label is what carries the change.
 */
function Diff({ diff }: { diff: SectionDiff }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="font-sans text-sm text-text-muted">
        {strings.diffSummary(diff.added, diff.removed)}
      </p>
      <ol className="flex flex-col gap-3">
        {diff.rows.map((row, index) => (
          <li
            key={index}
            className={cn(
              'rounded-note border-l-2 py-2 pr-3 pl-3',
              row.kind === 'added' && 'border-ai-added-rule bg-ai-added/50',
              row.kind === 'removed' && 'border-ai-corrected-mark/70 bg-ai-corrected/60',
              row.kind === 'kept' && 'border-border',
            )}
          >
            <p className="mb-1.5 font-sans text-xs font-medium tracking-wide text-text-muted uppercase">
              {row.kind === 'added'
                ? strings.diffAdded
                : row.kind === 'removed'
                  ? strings.diffRemoved
                  : strings.diffKept}
            </p>
            <div className={cn(row.kind === 'removed' && 'opacity-70')}>
              <RenderBlock block={row.block} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Re-exported for the tests, which drive the diff without the dialog. */
export type { SectionDiff, Section };
