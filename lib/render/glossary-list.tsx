import { cn } from '@/lib/utils/cn';
import type { GlossaryEntry } from '@/lib/ai/schema';

import { renderInline } from './markdown/inline';

/**
 * Every key term in the note, collected (03-DESIGN.md §6). A real `<dl>` in two columns on wide
 * screens — the shape of a textbook's back matter, and the shape a student scans before a test.
 */
export function GlossaryList({
  entries,
  className,
}: {
  entries: GlossaryEntry[];
  className?: string;
}) {
  if (entries.length === 0) return null;

  return (
    <section aria-labelledby="glossary-heading" className={cn('mt-10', className)}>
      <div className="mb-4 border-t border-border pt-6">
        <h2 id="glossary-heading" className="font-serif text-xl font-semibold text-text">
          Glossary
        </h2>
      </div>
      <dl className="grid gap-x-10 gap-y-3 sm:grid-cols-2">
        {entries.map((entry) => (
          <div key={entry.term} className="break-inside-avoid">
            <dt className="font-sans text-sm font-semibold text-text">
              {renderInline(entry.term, `gloss-term-${entry.term}`)}
            </dt>
            <dd className="text-sm leading-snug text-text-muted">
              {renderInline(entry.definition, `gloss-${entry.term}`)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
