'use client';

import { SegmentedControl } from '@/components/ui/segmented-control';
import { cn } from '@/lib/utils/cn';

import { READING_MODES, useReadingMode } from './reading-mode';
import type { ReadingMode } from './reading-mode';

/**
 * My original · Everything · Highlight AI (03-DESIGN.md §6).
 *
 * A segmented control rather than a switch, because these are three peers rather than an on/off:
 * "My original" is a genuinely useful way to read the note, not a diminished version of it. And a
 * radiogroup rather than tabs — see `SegmentedControl` for why that distinction has teeth.
 */
export function ReadingModeToggle({ className }: { className?: string }) {
  const { mode, setMode } = useReadingMode();
  const current = READING_MODES.find((entry) => entry.value === mode);

  return (
    <div className={cn('flex flex-col gap-1.5 font-sans', className)}>
      <SegmentedControl<ReadingMode>
        label="What to show"
        value={mode}
        onValueChange={setMode}
        options={READING_MODES.map((entry) => ({ value: entry.value, label: entry.label }))}
      />
      <p className="text-xs text-text-muted" aria-live="polite">
        {current?.hint}
      </p>
    </div>
  );
}
