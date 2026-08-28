'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Matches a media query reactively. Returns `false` on the server, so components must be written
 * so the wide/default branch is the safe one to render before hydration — for margin notes that
 * means "expanded", because content that is briefly visible is better than content that is
 * briefly missing.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () =>
      typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false,
    () => false,
  );
}

/**
 * The one breakpoint the note layout turns on (03-DESIGN.md §6): at and above it there is room
 * for a margin column beside the text, below it margin notes fold into `<details>`.
 */
export const WIDE_NOTE_QUERY = '(min-width: 1100px)';

export function useWideNoteLayout(): boolean {
  return useMediaQuery(WIDE_NOTE_QUERY);
}
