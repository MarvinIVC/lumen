'use client';

import { useEffect } from 'react';
import type { RefObject } from 'react';

/**
 * Makes a horizontally scrolling container keyboard-reachable, but only while it actually
 * overflows.
 *
 * A region you can scroll but cannot reach by keyboard fails WCAG 2.1.1. The usual fix —
 * `tabIndex={0}` on every scroll container — turns a note with thirty equations into a note with
 * thirty extra tab stops, so this measures instead: a wide comparison table on a phone becomes
 * focusable, the same table on a desktop does not.
 *
 * The attributes are written straight to the DOM rather than held in React state, and that is the
 * point rather than a shortcut. The measurement changes when content the renderer does not own
 * arrives — KaTeX and Mermaid both swap in their markup after a dynamic import resolves — and
 * routing that through `useState` means a render has to be scheduled and flushed before the
 * element is correct. Anything looking at the DOM in between, an accessibility checker included,
 * sees a scrollable region with no way in.
 *
 * `role="group"` and not `role="region"`: a region is a landmark, and a note with three wide
 * tables would otherwise have three landmarks competing for one name.
 */
export function useScrollableRegion(ref: RefObject<HTMLElement | null>, label: string): void {
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;

    const measure = () => {
      // Both axes, and no slack. A tolerance looks like sensible defensiveness against sub-pixel
      // rounding, but it opens a gap where the browser will scroll the element and we have
      // decided it does not. Vertical counts because CSS forces `overflow-y` to `auto` as soon as
      // `overflow-x` is set — a container that only means to scroll sideways can still end up
      // scrollable downwards.
      const overflows =
        element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight;
      if (overflows) {
        element.setAttribute('tabindex', '0');
        element.setAttribute('role', 'group');
        element.setAttribute('aria-label', label);
      } else {
        element.removeAttribute('tabindex');
        element.removeAttribute('role');
        element.removeAttribute('aria-label');
      }
    };

    measure();

    // Two observers, because the two things that matter change independently: the box is resized
    // by the viewport, while the content is replaced from the outside when a dynamic import
    // lands — a swap that need not change the container's own size at all.
    const resize = new ResizeObserver(measure);
    resize.observe(element);

    const mutations = new MutationObserver(measure);
    mutations.observe(element, { childList: true, subtree: true, characterData: true });

    // And a third trigger that neither observer can see: web fonts swapping in. The box does not
    // change and the DOM does not change — only the glyph metrics do, which is precisely what
    // decides whether an equation is too wide for its column. Missing this leaves the note
    // measured against the fallback font.
    let cancelled = false;
    const frame = requestAnimationFrame(measure);
    void document.fonts?.ready.then(() => {
      if (!cancelled) measure();
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
    };
  }, [ref, label]);
}
