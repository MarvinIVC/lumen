'use client';

import { useRef } from 'react';

import type { ChartSpec } from '@/lib/ai/schema';

import { BarsChart } from './bars';
import { CompositionChart } from './composition';
import { LineChart } from './line';
import { StepsChart } from './steps';
import { useChartSize } from './use-chart-size';

/**
 * `DataChart` — the hand-rolled SVG charts from 06 §1. No charting library: these are small,
 * themable through CSS variables (so a theme flip needs no re-render at all, unlike Mermaid), and
 * they print as vector.
 *
 * The wrapper exists to measure. Everything below it draws at 1 unit = 1 CSS pixel.
 */
export function DataChart({ spec, alt }: { spec: ChartSpec; alt: string }) {
  const container = useRef<HTMLDivElement>(null);
  const width = useChartSize(container);

  return (
    <div ref={container} className="w-full">
      {renderChart(spec, alt, width)}
    </div>
  );
}

function renderChart(spec: ChartSpec, alt: string, width: number) {
  switch (spec.kind) {
    case 'bars':
      return <BarsChart spec={spec} alt={alt} width={width} />;
    case 'line':
      return <LineChart spec={spec} alt={alt} width={width} />;
    case 'steps':
      return <StepsChart spec={spec} alt={alt} width={width} />;
    case 'composition':
      return <CompositionChart spec={spec} alt={alt} width={width} />;
  }
}
