'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import type { Origin } from '@/lib/ai/schema';

/**
 * The reading-mode toggle (03-DESIGN.md §6, 06 §1). Renderer state, held in context so every
 * block and inline span can answer two questions without prop-drilling:
 *
 *   "should I be on the page at all?"  → `shouldRender(origin)`
 *   "how loudly should my mark show?"  → `markIntensity`
 *
 * The three modes are a trust surface, not a preference:
 *   my-original — reconstructs the note from the student's own fragments only. Proves we did not
 *                 quietly replace their work.
 *   everything  — the default. Marks are present but calm.
 *   highlight   — turns every mark up, for a pass specifically looking at what changed.
 */
export type ReadingMode = 'my-original' | 'everything' | 'highlight';

export const READING_MODES: { value: ReadingMode; label: string; hint: string }[] = [
  {
    value: 'my-original',
    label: 'My original',
    hint: 'Only the parts you wrote yourself.',
  },
  {
    value: 'everything',
    label: 'Everything',
    hint: 'Your notes plus what we added, marked but calm.',
  },
  {
    value: 'highlight',
    label: 'Highlight AI',
    hint: 'Every addition, clarification and correction turned up.',
  },
];

interface ReadingModeContextValue {
  mode: ReadingMode;
  setMode: (mode: ReadingMode) => void;
  /**
   * Kept as the renderer's per-block hook, though it now always answers true: `my-original` is a
   * document transform rather than a filter (see `ReadingModeProvider`). The seam is worth the
   * line — a future mode that hides a block type has somewhere to live.
   */
  shouldRender: (origin: Origin) => boolean;
  /** `calm` draws the rule and the tint; `loud` adds the always-visible label chip. */
  markIntensity: 'calm' | 'loud';
}

const ReadingModeContext = createContext<ReadingModeContextValue | null>(null);

export function ReadingModeProvider({
  children,
  defaultMode = 'everything',
  mode: controlled,
  onModeChange,
}: {
  children: ReactNode;
  defaultMode?: ReadingMode;
  /**
   * Set to hoist the mode out of the renderer.
   *
   * Phase-05 puts the toggle in the workspace's sticky action bar, where it sits beside Edit and
   * Study, rather than under the title where phase-01 drew it. The renderer stays a pure function
   * of its props either way: uncontrolled it owns the state and draws its own toggle, controlled
   * it does neither.
   */
  mode?: ReadingMode;
  onModeChange?: (mode: ReadingMode) => void;
}) {
  const [uncontrolled, setUncontrolled] = useState<ReadingMode>(defaultMode);
  const mode = controlled ?? uncontrolled;

  const value = useMemo<ReadingModeContextValue>(
    () => ({
      mode,
      setMode: onModeChange ?? setUncontrolled,
      // `my-original` no longer filters here. Dropping every non-student block loses the student's
      // own wording for anything we corrected — it survives only in `originalText` — so the whole
      // document is transformed by `toMyOriginal` before it reaches the renderer. `lib/notes/
      // reading.ts` has the case that proved it. This stays true for the other two modes.
      shouldRender: () => true,
      markIntensity: mode === 'highlight' ? 'loud' : 'calm',
    }),
    [mode, onModeChange],
  );

  return <ReadingModeContext.Provider value={value}>{children}</ReadingModeContext.Provider>;
}

/**
 * Falls back to "show everything, calmly" outside a provider, so a single block can be dropped
 * into a story or an export without the caller having to remember the wrapper.
 */
export function useReadingMode(): ReadingModeContextValue {
  const context = useContext(ReadingModeContext);
  if (context) return context;
  return {
    mode: 'everything',
    setMode: () => {},
    shouldRender: () => true,
    markIntensity: 'calm',
  };
}
