'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Radio, RadioGroup } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { CheckIcon, XIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils/cn';
import { renderInline } from '@/lib/render/markdown/inline';
import type { QuizItem } from '@/lib/ai/schema';

export interface QuizRunnerProps {
  items: QuizItem[];
  className?: string;
}

/**
 * The quiz shell (03-DESIGN.md §5, §7). Phase-08 adds scoring and persistence; the interaction
 * model and the feedback moment are settled here.
 *
 * Short-answer questions are self-marked on purpose. String-matching a chemistry answer punishes
 * "35.45 u" against "35.45" and teaches students to write for the parser, so the explanation is
 * revealed and they judge — which is closer to how they will actually revise anyway.
 */
export function QuizRunner({ items, className }: QuizRunnerProps) {
  const [index, setIndex] = useState(0);
  const [choice, setChoice] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  const item = items[index];
  if (!item) return null;

  const correct = item.kind === 'multiple-choice' ? choice === item.answer : null;
  const last = index === items.length - 1;

  const next = () => {
    setIndex((value) => Math.min(items.length - 1, value + 1));
    setChoice(null);
    setRevealed(false);
  };

  return (
    <div role="group" aria-label="Quiz" className={cn('flex flex-col gap-5 font-sans', className)}>
      <Progress
        value={((index + 1) / items.length) * 100}
        label={`Question ${index + 1} of ${items.length}`}
      />

      <div className="lumen-note">
        <p className="text-md leading-note text-text">{renderInline(item.prompt, `q-${index}`)}</p>
      </div>

      {item.kind === 'multiple-choice' && item.choices ? (
        <RadioGroup
          value={choice ?? ''}
          onValueChange={setChoice}
          aria-label="Answers"
          disabled={revealed}
        >
          {item.choices.map((option) => (
            <div
              key={option}
              className={cn(
                'rounded-sm px-2 py-1 transition-colors duration-(--dur-fast) ease-lumen',
                revealed && option === item.answer && 'bg-success/10',
                revealed && option === choice && option !== item.answer && 'bg-danger/10',
              )}
            >
              <Radio value={option} label={renderInline(option, `opt-${option}`)} />
            </div>
          ))}
        </RadioGroup>
      ) : (
        <Textarea
          rows={3}
          aria-label="Your answer"
          placeholder="Write your answer, then check it."
          disabled={revealed}
        />
      )}

      {revealed ? (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-bg-sunken p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-text">
            {correct === null ? null : correct ? (
              <CheckIcon aria-hidden="true" className="text-base text-success" />
            ) : (
              <XIcon aria-hidden="true" className="text-base text-danger" />
            )}
            {correct === null ? 'The answer' : correct ? 'Right' : 'Not quite'}
          </p>
          <div className="lumen-note text-sm leading-note text-text">
            {renderInline(item.answer, `a-${index}`)}
          </div>
          {item.explanation ? (
            <p className="text-sm leading-snug text-text-muted">
              {renderInline(item.explanation, `e-${index}`)}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        {revealed ? (
          <Button variant="primary" onClick={next} disabled={last}>
            {last ? 'That was the last one' : 'Next question'}
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={() => setRevealed(true)}
            disabled={item.kind === 'multiple-choice' && choice === null}
          >
            Check
          </Button>
        )}
      </div>
    </div>
  );
}
