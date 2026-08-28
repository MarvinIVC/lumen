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
  /** False for AI-origin content in `my-original`. */
  shouldRender: (origin: Origin) => boolean;
  /** `calm` draws the rule and the tint; `loud` adds the always-visible label chip. */
  markIntensity: 'calm' | 'loud';
}

const ReadingModeContext = createContext<ReadingModeContextValue | null>(null);

export function ReadingModeProvider({
  children,
  defaultMode = 'everything',
}: {
  children: ReactNode;
  defaultMode?: ReadingMode;
}) {
  const [mode, setMode] = useState<ReadingMode>(defaultMode);

  const value = useMemo<ReadingModeContextValue>(
    () => ({
      mode,
      setMode,
      shouldRender: (origin) => mode !== 'my-original' || origin === 'student',
      markIntensity: mode === 'highlight' ? 'loud' : 'calm',
    }),
    [mode],
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
