import { cn } from '@/lib/utils/cn';
import type { OpenQuestion } from '@/lib/ai/schema';

import { renderInline } from './markdown/inline';

/**
 * Where "your notes were incomplete or ambiguous, and here is what we assumed" lives (06 §5.3).
 *
 * Prominent when non-empty, absent when not. Each entry says what to confirm and with whom —
 * "check with your teacher" is actionable, "this may be inaccurate" is not.
 */
export function OpenQuestionsPanel({
  questions,
  className,
}: {
  questions: OpenQuestion[];
  className?: string;
}) {
  if (questions.length === 0) return null;

  return (
    <section aria-labelledby="open-questions-heading" className={cn('mt-10 font-sans', className)}>
      <div className="mb-4 border-t border-border pt-6">
        <h2 id="open-questions-heading" className="font-serif text-xl font-semibold text-text">
          Confirm these with your teacher
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          {questions.length === 1
            ? 'One thing your notes left open.'
            : `${questions.length} things your notes left open.`}
        </p>
      </div>

      <ol className="flex flex-col gap-4">
        {questions.map((question, index) => (
          <li key={index} className="border-l-2 border-border-strong pl-4">
            <p className="leading-snug text-text">
              {renderInline(question.question, `oq-${index}`)}
            </p>
            <p className="mt-1 text-sm leading-snug text-text-muted">
              {renderInline(question.why, `oq-why-${index}`)}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
