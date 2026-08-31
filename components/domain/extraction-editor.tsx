'use client';

import { useEffect, useMemo, useRef } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  MergeUpIcon,
  ScissorsIcon,
  SparkIcon,
  TrashIcon,
} from '@/components/ui/icons';
import { appStrings } from '@/lib/app/strings';
import type { ExtractedBlock } from '@/lib/ingest/types';
import { cn } from '@/lib/utils/cn';

export interface ExtractionEditorProps {
  blocks: ExtractedBlock[];
  onChangeText: (blockId: string, text: string) => void;
  onDelete: (blockId: string) => void;
  onMergeUp: (blockId: string) => void;
  onMove: (blockId: string, direction: -1 | 1) => void;
  /** "These are two lessons" — cuts above the block at `index`. */
  onSplit?: (index: number) => void;
  onRunOcr?: (blockId: string) => void;
  /** False until phase-04 deploys the `ocr` function; the button then says so instead of lying. */
  ocrAvailable?: boolean;
  /** Object URL for a page thumbnail or an embedded image, if one has been made. */
  assetUrl?: (assetId: string) => string | undefined;
  readOnly?: boolean;
  className?: string;
}

/**
 * The review screen's left pane (01-PRODUCT.md §2 step 3, 03-DESIGN.md §5).
 *
 * This screen exists to prevent wasted AI calls, so every affordance here is about *removing*
 * things: the teacher's footer repeated on fourteen pages, the page of admin notices, the photo
 * that turned out to be of the wrong whiteboard. Deleting is one click and undoable by re-adding
 * the file; nothing here is destructive to the source.
 *
 * One textarea per block rather than a single contenteditable surface. That is a deliberate
 * trade: cross-block editing is worse, and everything else is better — keyboard behaviour, screen
 * reader announcement, Chinese input, paste handling, and dropping an OCR result in as a new
 * editable block. Phase-06 brings TipTap for the finished document, where rich editing is the
 * point; here the job is corrections.
 */
export function ExtractionEditor({
  blocks,
  onChangeText,
  onDelete,
  onMergeUp,
  onMove,
  onSplit,
  onRunOcr,
  ocrAvailable = false,
  assetUrl,
  readOnly = false,
  className,
}: ExtractionEditorProps) {
  // A marker is drawn when the page changes, not on every block — fourteen "Page 3"s down the
  // side of the pane is noise, and the one that matters is the one where the page turns.
  const markers = useMemo(() => {
    let previous = '';
    return blocks.map((block) => {
      const label = block.pageRef.label;
      const show = label !== previous;
      previous = label;
      return show ? label : null;
    });
  }, [blocks]);

  return (
    <ol className={cn('flex flex-col font-sans', className)}>
      {blocks.map((block, index) => (
        <li key={block.id} className="flex flex-col gap-1">
          {markers[index] ? (
            <div className="flex items-center gap-3 pt-3 first:pt-0">
              <span className="text-xs font-medium tracking-wide text-text-muted uppercase">
                {markers[index]}
              </span>
              <span aria-hidden="true" className="h-px flex-1 bg-border" />
              {onSplit && index > 0 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<ScissorsIcon />}
                  onClick={() => onSplit(index)}
                >
                  {appStrings.review.splitCta}
                </Button>
              ) : null}
            </div>
          ) : null}

          <BlockRow
            block={block}
            index={index}
            total={blocks.length}
            onChangeText={onChangeText}
            onDelete={onDelete}
            onMergeUp={onMergeUp}
            onMove={onMove}
            {...(onRunOcr ? { onRunOcr } : {})}
            ocrAvailable={ocrAvailable}
            {...(assetUrl ? { assetUrl } : {})}
            readOnly={readOnly}
          />
        </li>
      ))}
    </ol>
  );
}

interface BlockRowProps {
  block: ExtractedBlock;
  index: number;
  total: number;
  onChangeText: (blockId: string, text: string) => void;
  onDelete: (blockId: string) => void;
  onMergeUp: (blockId: string) => void;
  onMove: (blockId: string, direction: -1 | 1) => void;
  onRunOcr?: (blockId: string) => void;
  ocrAvailable: boolean;
  assetUrl?: (assetId: string) => string | undefined;
  readOnly: boolean;
}

function BlockRow({
  block,
  index,
  total,
  onChangeText,
  onDelete,
  onMergeUp,
  onMove,
  onRunOcr,
  ocrAvailable,
  assetUrl,
  readOnly,
}: BlockRowProps) {
  const marker = block.pageRef.label;
  const url = block.assetId && assetUrl ? assetUrl(block.assetId) : undefined;
  const scan = Boolean(block.needsOCR);

  return (
    <div
      className={cn(
        'group/block relative flex flex-col gap-1 rounded-md border px-2 py-1.5',
        scan ? 'border-warning/50 bg-verify' : 'border-transparent hover:border-border',
      )}
    >
      {scan ? (
        <div className="flex flex-col gap-2.5">
          {url ? (
            /* eslint-disable-next-line @next/next/no-img-element -- a blob: URL from IndexedDB;
               next/image cannot optimise one and would only add a layout wrapper. */
            <img
              src={url}
              alt={appStrings.blocks.imageAlt(marker)}
              className="max-h-72 w-auto max-w-full self-start rounded-sm border border-border"
            />
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="warning">{appStrings.blocks.scanBadge}</Badge>
            {onRunOcr ? (
              <Button
                size="sm"
                variant="secondary"
                icon={<SparkIcon />}
                disabled={!ocrAvailable}
                onClick={() => onRunOcr(block.id)}
              >
                {`${appStrings.review.ocrCta} (${appStrings.review.ocrCost})`}
              </Button>
            ) : null}
            <p className="text-xs text-text-muted">{appStrings.review.ocrCost}</p>
          </div>
        </div>
      ) : (
        <AutoTextarea
          label={appStrings.blocks.editLabel(marker)}
          value={block.text}
          readOnly={readOnly}
          heading={block.kind === 'heading'}
          onChange={(text) => onChangeText(block.id, text)}
        />
      )}

      {/*
        Two layouts, because hover does not exist on a phone.

        On a pointer device the controls sit over the top-right corner of the block, out of the
        flow — forty blocks each reserving a row for controls they were not showing was most of the
        height of the pane. They stay in the DOM and stay tabbable, and the block reveals them as
        soon as anything inside it takes focus: a control that appears on hover alone is a control
        a keyboard user cannot find.

        On a narrow screen they are always visible and stay in the flow, below the text. Overlaying
        them there squeezed every block into a column half the width of the screen.
      */}
      <div
        className={cn(
          'flex items-center justify-end gap-0.5',
          'sm:absolute sm:top-1 sm:right-1 sm:z-10 sm:rounded-sm sm:border sm:border-border',
          'sm:bg-bg-raised sm:px-0.5 sm:opacity-0 sm:transition-opacity sm:duration-(--dur-fast)',
          'sm:ease-lumen sm:group-focus-within/block:opacity-100 sm:group-hover/block:opacity-100',
        )}
      >
        {block.edited ? (
          <span className="px-1 text-xs text-text-muted">{appStrings.blocks.editedBadge}</span>
        ) : null}
        <IconButton
          size="sm"
          label={appStrings.blocks.upLabel(marker)}
          icon={<ArrowUpIcon />}
          disabled={index === 0}
          onClick={() => onMove(block.id, -1)}
        />
        <IconButton
          size="sm"
          label={appStrings.blocks.downLabel(marker)}
          icon={<ArrowDownIcon />}
          disabled={index === total - 1}
          onClick={() => onMove(block.id, 1)}
        />
        <IconButton
          size="sm"
          label={appStrings.blocks.mergeLabel(marker)}
          icon={<MergeUpIcon />}
          disabled={index === 0}
          onClick={() => onMergeUp(block.id)}
        />
        <IconButton
          size="sm"
          label={appStrings.blocks.deleteLabel(marker)}
          icon={<TrashIcon />}
          onClick={() => onDelete(block.id)}
        />
      </div>
    </div>
  );
}

/**
 * A textarea that is exactly as tall as its content.
 *
 * Estimating the height from the character count was the first attempt and it was wrong in both
 * directions: a floor of two rows made a pane of thirty one-line definitions a minute of
 * scrolling, and any estimate at all clipped the fixture's mercury calculation, which is the one
 * block on that page a student most needs to see whole. Measuring `scrollHeight` cannot be wrong,
 * because it is not a guess.
 *
 * `rows={1}` and an explicit height, rather than a CSS-only trick, because the height has to
 * settle before paint on a pane that is forty blocks long.
 */
function AutoTextarea({
  label,
  value,
  readOnly,
  heading,
  onChange,
}: {
  label: string;
  value: string;
  readOnly: boolean;
  heading: boolean;
  onChange: (text: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    // Collapse first: `scrollHeight` never shrinks below the current height.
    element.style.height = '0px';
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  return (
    <Textarea
      prose
      ref={ref}
      rows={1}
      aria-label={label}
      value={value}
      readOnly={readOnly}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        'resize-none overflow-hidden border-transparent bg-transparent',
        'hover:border-border focus:border-border-strong',
        heading && 'text-lg font-semibold',
      )}
    />
  );
}
