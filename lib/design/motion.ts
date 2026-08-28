/**
 * Motion tokens and the reduced-motion escape hatch (03-DESIGN.md §7).
 *
 * Durations and easing live in tokens.css; this module is the JS mirror plus the one hook every
 * animated component uses. The rule from §7 is absolute: with `prefers-reduced-motion: reduce`
 * there is *no* transform/opacity animation, only instant state. globals.css enforces that
 * globally for CSS animations; `useReducedMotion()` is for the cases JS decides, like whether to
 * stagger a section reveal at all.
 */
import { useEffect, useState } from 'react';

/** Hover, press, tint changes. */
export const DUR_FAST = 120;
/** Enter/exit: dialogs, popovers, toasts, route transitions. */
export const DUR_BASE = 200;
/** Section reveal, the completion "settle". */
export const DUR_SLOW = 320;
/** Flashcard flip — the one deliberately slower move (§7). */
export const DUR_FLIP = 260;

export const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * True when the user has asked for reduced motion. Returns `false` during SSR and on the first
 * client render so markup matches; the effect corrects it before paint-relevant work happens.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    setReduced(query.matches);
    const handler = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }, []);

  return reduced;
}

/** Non-reactive read, for imperative code that runs once (a Mermaid re-render, a scroll). */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * Per-item delay for a staggered reveal, capped so a long section never crawls. Returns 0 when
 * motion is reduced, which collapses the stagger to "everything is just there".
 */
export function staggerDelay(index: number, reduced: boolean, step = 40, max = 240): number {
  if (reduced) return 0;
  return Math.min(index * step, max);
}
