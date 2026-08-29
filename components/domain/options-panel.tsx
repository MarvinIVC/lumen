'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { InfoIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils/cn';
import type { Depth, EnhanceMode, EnhanceOptions, Visuals, Voice } from '@/lib/ai/schema';

export interface CostEstimate {
  /** Formatted for display — the caller owns the currency and the rounding. */
  amount: string;
  /** Roughly how long, in the user's words: "about 40 seconds". */
  duration: string;
  /** True while the estimate is still a guess from the input length alone. */
  provisional?: boolean;
}

export interface OptionsPanelProps {
  options: EnhanceOptions;
  onChange: (options: EnhanceOptions) => void;
  /**
   * Live estimate. Optional because the real one arrives in phase-04 — until then the panel shows
   * a placeholder rather than a fabricated number, which is the honest default for a price.
   */
  estimate?: CostEstimate;
  className?: string;
}

const MODES: { value: EnhanceMode; label: string; hint: string }[] = [
  { value: 'tidy', label: 'Tidy up', hint: 'Fix the wording and the layout. Add nothing.' },
  {
    value: 'complete',
    label: 'Complete it',
    hint: 'Finish the half-written examples and fill the gaps your notes left.',
  },
  {
    value: 'study_guide',
    label: 'Study guide',
    hint: 'Everything above, plus flashcards and a quiz.',
  },
];

const DEPTHS: { value: Depth; label: string; hint: string }[] = [
  {
    value: 'brief',
    label: 'Brief',
    hint: 'Shorter than your notes. Good for a last-minute review.',
  },
  { value: 'match', label: 'Match mine', hint: 'About the length you wrote.' },
  { value: 'thorough', label: 'Thorough', hint: 'Fuller explanations and more worked examples.' },
];

const VISUALS: { value: Visuals; label: string; hint: string }[] = [
  { value: 'none', label: 'None', hint: 'Text only.' },
  { value: 'auto', label: 'Auto', hint: 'Diagrams and charts where they earn their place.' },
  { value: 'more', label: 'More', hint: 'A visual for every process and comparison.' },
];

const VOICES: { value: Voice; label: string; hint: string }[] = [
  { value: 'keep-mine', label: 'Keep my voice', hint: 'Your phrasing, cleaned up.' },
  { value: 'textbook', label: 'Textbook', hint: 'Rewritten in a neutral, formal register.' },
];

/**
 * The four choices before generation (03-DESIGN.md §5). Each is a segmented control with a live
 * hint underneath, because the difference between "match mine" and "thorough" is not guessable
 * from the label and a student should not have to spend a daily credit to find out.
 *
 * The cost estimate sits at the bottom and is deliberately plain. Free is the promise; showing
 * the number anyway is what makes the promise checkable (00-BRIEF.md §5).
 */
export function OptionsPanel({ options, onChange, estimate, className }: OptionsPanelProps) {
  const set =
    <K extends keyof EnhanceOptions>(key: K) =>
    (value: EnhanceOptions[K]) =>
      onChange({ ...options, [key]: value });

  return (
    <div
      role="group"
      aria-label="Options"
      className={cn('flex flex-col gap-5 font-sans', className)}
    >
      <Choice
        label="How much should we do?"
        entries={MODES}
        value={options.mode}
        onChange={set('mode')}
      />
      <Choice label="How long?" entries={DEPTHS} value={options.depth} onChange={set('depth')} />
      <Choice
        label="Diagrams and charts"
        entries={VISUALS}
        value={options.visuals}
        onChange={set('visuals')}
      />
      <Choice label="Voice" entries={VOICES} value={options.voice} onChange={set('voice')} />

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <div className="flex items-center gap-1.5">
          <p className="text-sm text-text-muted">Estimated cost</p>
          <Popover>
            <PopoverTrigger
              aria-label="How the estimate works"
              className="text-base text-text-muted hover:text-text"
            >
              <InfoIcon />
            </PopoverTrigger>
            <PopoverContent label="How the estimate works" side="top">
              <p className="text-sm leading-snug text-text-muted">
                Worked out from the length of your notes and the options above. It comes out of your
                free daily allowance — you are not charged. With your own API key, this is what your
                provider will bill you.
              </p>
            </PopoverContent>
          </Popover>
        </div>
        {estimate ? (
          <p className="text-right text-sm text-text">
            <span className="font-medium tabular-nums">{estimate.amount}</span>
            <span className="text-text-muted"> · {estimate.duration}</span>
            {estimate.provisional ? (
              <span className="block text-xs text-text-muted">rough, until we read the files</span>
            ) : null}
          </p>
        ) : (
          <p className="text-sm text-text-muted">Once we have read your notes</p>
        )}
      </div>
    </div>
  );
}

function Choice<T extends string>({
  label,
  entries,
  value,
  onChange,
}: {
  label: string;
  entries: { value: T; label: string; hint: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const current = entries.find((entry) => entry.value === value);

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium text-text">{label}</p>
      <SegmentedControl
        fullWidth
        label={label}
        value={value}
        onValueChange={onChange}
        options={entries.map((entry) => ({ value: entry.value, label: entry.label }))}
      />
      {/* The hint changes with the selection, so it is announced rather than silently swapped. */}
      <p className="text-xs text-text-muted" aria-live="polite">
        {current?.hint}
      </p>
    </div>
  );
}
