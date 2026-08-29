import { cn } from '@/lib/utils/cn';
import type { MarginNoteBlock } from '@/lib/ai/schema';

import { renderInline } from './markdown/inline';

const KIND_LABELS: Record<MarginNoteBlock['kind'], string> = {
  connection: 'Connection',
  mnemonic: 'Mnemonic',
  'exam-tip': 'Exam tip',
  'why-it-matters': 'Why this matters',
};

/**
 * The printed resolution of the margin notes (06 §2).
 *
 * On paper the outer margin belongs to the page box — running header, folio — so a Tufte sidenote
 * has nowhere to sit. Numbering them in the text and collecting them here is what a printed book
 * does with the same problem, and it keeps every note findable rather than dropping the ones that
 * would not fit.
 */
export function EndNotes({ notes, className }: { notes: MarginNoteBlock[]; className?: string }) {
  if (notes.length === 0) return null;

  return (
    <section aria-labelledby="endnotes-heading" className={cn('mt-10', className)}>
      <div className="mb-4 border-t border-border pt-6">
        <h2 id="endnotes-heading" className="font-serif text-xl font-semibold text-text">
          Notes
        </h2>
      </div>
      <ol className="flex list-none flex-col gap-3">
        {notes.map((note, index) => (
          <li
            key={index}
            id={`endnote-${index + 1}`}
            className="grid grid-cols-[1.5rem_1fr] gap-x-2 text-sm leading-snug"
          >
            <span className="text-right font-sans text-accent tabular-nums">{index + 1}.</span>
            <span className="text-text-muted">
              <span className="font-sans text-xs font-semibold tracking-wider text-text uppercase">
                {KIND_LABELS[note.kind]}
                {note.origin === 'student' ? ' — yours, kept' : ''}
              </span>{' '}
              {renderInline(note.text, `endnote-${index}`)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
