import { cn } from '@/lib/utils/cn';
import type { WorkedExampleBlock } from '@/lib/ai/schema';

import { MathBlock } from '../math/math-block';
import { renderInline } from '../markdown/inline';

/**
 * The worked example (03-DESIGN.md §6) — the block students actually reread before a test.
 *
 * Problem, then numbered steps with the maths on its own line, then the answer *boxed* with its
 * units and significant figures, then one muted "common mistake" line. The box around the answer
 * is not decoration: it is where the eye goes when you are checking your own work against it.
 *
 * When the example finishes or fixes the student's own attempt, their line appears struck through
 * above the solution, on the amber correction tint. That strip is the whole trust story of the
 * product in one block — we did not silently replace their work, we showed it and said why.
 */
export function WorkedExample({
  block,
  className,
}: {
  block: WorkedExampleBlock;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        'my-7 rounded-note border bg-bg-raised px-5 py-4',
        block.studentAttempt
          ? 'border-l-2 border-ai-corrected-mark/60 border-l-ai-corrected-mark'
          : 'border-border-strong',
        className,
      )}
    >
      <p className="mb-2 font-sans text-xs font-semibold tracking-wider text-text-muted uppercase">
        Worked example
      </p>

      <div className="leading-note">
        <span className="font-sans text-sm font-semibold text-text">Problem. </span>
        {renderInline(block.problem, 'we-problem')}
      </div>

      {block.studentAttempt ? (
        <div className="mt-4 rounded-r-note border-l-2 border-ai-corrected-mark bg-ai-corrected py-2.5 pr-3 pl-4">
          <p className="font-sans text-xs font-semibold tracking-wider text-text-muted uppercase">
            Your line, corrected
          </p>
          <p className="mt-1.5 leading-snug">
            <span className="sr-only">You wrote: </span>
            <span className="lumen-struck text-text-muted decoration-ai-corrected-mark">
              {renderInline(block.studentAttempt.original, 'we-attempt')}
            </span>
          </p>
          <p className="mt-1 font-sans text-sm text-text">
            {renderInline(block.studentAttempt.issue, 'we-issue')}
          </p>
        </div>
      ) : null}

      <p className="mt-4 mb-1 font-sans text-sm font-semibold text-text">Solution.</p>
      <ol className="flex list-decimal flex-col gap-3 pl-5 marker:font-sans marker:text-text-muted">
        {block.steps.map((step, index) => (
          <li key={index} className="leading-note">
            {renderInline(step.text, `we-step-${index}`)}
            {step.latex ? <MathBlock latex={step.latex} className="mt-1.5" /> : null}
          </li>
        ))}
      </ol>

      <div className="mt-5 flex justify-center">
        <div className="rounded-note border-2 border-accent bg-accent-weak px-4 py-2">
          {block.answerLatex ? (
            <MathBlock latex={block.answerLatex} />
          ) : (
            <p className="text-center font-sans font-semibold text-text">{block.answer}</p>
          )}
          {block.answerLatex ? <span className="sr-only">Answer: {block.answer}</span> : null}
        </div>
      </div>

      {block.commonMistake ? (
        <figcaption className="mt-4 border-t border-border pt-3 font-sans text-sm text-text-muted">
          <span className="font-semibold text-text">Common mistake. </span>
          {renderInline(block.commonMistake, 'we-mistake')}
        </figcaption>
      ) : null}
    </figure>
  );
}
