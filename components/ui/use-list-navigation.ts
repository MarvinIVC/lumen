'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The keyboard model shared by `Combobox` and `CommandMenu`: arrows move an *active* item without
 * moving focus (focus stays in the text input), Home/End jump, Enter commits, Esc closes.
 *
 * Keeping focus in the input is what makes `aria-activedescendant` the right pattern here — the
 * user is typing and choosing at the same time, so the caret must not go anywhere.
 */
export interface ListNavigation {
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  /** Attach to the text input's `onKeyDown`. Returns true when it handled the key. */
  onKeyDown: (event: React.KeyboardEvent) => boolean;
  /** Ref for the scrolling viewport, so the active row can be kept visible. */
  listRef: React.RefObject<HTMLDivElement | null>;
}

export function useListNavigation(options: {
  itemCount: number;
  onCommit: (index: number) => void;
  onDismiss?: () => void;
  /** Reset the active row whenever this changes — the query, usually. */
  resetKey?: unknown;
}): ListNavigation {
  const { itemCount, onCommit, onDismiss, resetKey } = options;
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setActiveIndex(0);
  }, [resetKey]);

  // Keep the active row in view without hijacking the page scroll.
  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent): boolean => {
      if (itemCount === 0 && event.key !== 'Escape') return false;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setActiveIndex((index) => (index + 1) % itemCount);
          return true;
        case 'ArrowUp':
          event.preventDefault();
          setActiveIndex((index) => (index - 1 + itemCount) % itemCount);
          return true;
        case 'Home':
          event.preventDefault();
          setActiveIndex(0);
          return true;
        case 'End':
          event.preventDefault();
          setActiveIndex(itemCount - 1);
          return true;
        case 'Enter':
          event.preventDefault();
          onCommit(activeIndex);
          return true;
        case 'Escape':
          onDismiss?.();
          return true;
        default:
          return false;
      }
    },
    [activeIndex, itemCount, onCommit, onDismiss],
  );

  return { activeIndex, setActiveIndex, onKeyDown, listRef };
}

/**
 * Case- and accent-insensitive substring match. Deliberately not fuzzy: for a subject list or a
 * short command set, fuzzy matching mostly produces surprising top hits.
 */
export function matches(haystack: string, query: string): boolean {
  if (!query) return true;
  const normalise = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '');
  return normalise(haystack).includes(normalise(query));
}
