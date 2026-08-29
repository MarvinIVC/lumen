import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * "Has this scrolled close enough to matter yet?"
 *
 * The landing page's two heavy sections — the provenance demo and the full note — are worth several
 * hundred kilobytes between them (KaTeX, Mermaid, smiles-drawer, the renderer, the fixture). None
 * of that may touch the first load (02-ARCHITECTURE.md §8), so each section server-renders a static
 * summary and swaps in the live component once it is nearly on screen.
 *
 * `rootMargin` is deliberately generous: the fetch and the render should finish before the section
 * is actually looked at, so the reader never sees the swap happen.
 */
export function useInView<T extends HTMLElement>(
  rootMargin = '400px',
): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView) return;

    const node = ref.current;
    if (!node) return;

    // No observer means an old browser, and an old browser should get the content rather than a
    // permanent placeholder.
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [inView, rootMargin]);

  return [ref, inView];
}
