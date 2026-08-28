'use client';

import { cn } from '@/lib/utils/cn';
import { useWideNoteLayout } from '@/lib/design/use-media-query';
import type { MarginNoteBlock, MarginNoteKind } from '@/lib/ai/schema';

import { renderInline } from './markdown/inline';

const KIND_LABELS: Record<MarginNoteKind, string> = {
  connection: 'Connection',
  mnemonic: 'Mnemonic',
  'exam-tip': 'Exam tip',
  'why-it-matters': 'Why this matters',
};

/**
 * A Tufte sidenote (03-DESIGN.md §6): on a wide viewport it sits in the margin column aligned to
 * the paragraph it annotates; below 1100px it folds into a `<details>` with a distinct left rule.
 *
 * It is one `<details>` element in both cases, with `open` driven by the viewport, rather than two
 * elements swapped by CSS. Rendering both and hiding one would duplicate the text for a screen
 * reader, and duplicating a student's own mnemonic in the accessibility tree is exactly the "soup
 * of margin notes" 01-PRODUCT.md §7 says the reading path must not become.
 *
 * Before hydration it renders open, because a note briefly visible beats a note briefly missing.
 */
export function MarginNote({ block, className }: { block: MarginNoteBlock; className?: string }) {
  const wide = useWideNoteLayout();

  return (
    <details
      open={wide}
      data-margin-note
      className={cn(
        'group/note my-3 border-l-2 border-border-strong pl-3 font-sans',
        // In the margin column the disclosure triangle is noise — there is nothing to disclose.
        wide && 'lg:my-0',
        className,
      )}
    >
      <summary
        className={cn(
          'cursor-pointer list-none text-xs font-semibold tracking-wider text-text-muted uppercase',
          'marker:hidden',
          wide && 'cursor-default',
        )}
      >
        {KIND_LABELS[block.kind]}
        {block.origin === 'student' ? (
          // No opacity here: --text-muted is exactly at the 4.5:1 line, so any fade drops the
          // label below it. Weight and case carry the de-emphasis instead.
          <span className="ml-1.5 font-normal normal-case">— yours, kept</span>
        ) : null}
      </summary>
      <div className="mt-1.5 text-sm leading-snug text-text-muted">
        {renderInline(block.text, 'margin')}
      </div>
    </details>
  );
}
