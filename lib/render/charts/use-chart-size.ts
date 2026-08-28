'use client';

import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

/**
 * Measures the container so the chart can use 1 SVG unit = 1 CSS pixel.
 *
 * The alternative — a fixed viewBox scaled to fit — makes every label shrink with the viewport,
 * which is exactly wrong on a phone: the chart gets smaller *and* its type gets smaller. Drawing
 * at true pixel size means a 12px axis label is 12px at 375px wide and at 1440px, and it lets the
 * narrow layout drop ticks instead of squashing them.
 */
export function useChartSize(ref: RefObject<HTMLElement | null>, fallback = 640): number {
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width ?? 0;
      if (measured > 0) setWidth(measured);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}
