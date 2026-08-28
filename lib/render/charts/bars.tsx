import type { BarsChartSpec } from '@/lib/ai/schema';

import { AxisTitle, ChartFrame, DirectLabel, TickLabel } from './chart-frame';
import { formatNumber, linearScale, niceDomain } from './scale';

/**
 * A category-per-bar plot: a mass spectrum's stick peaks, successive ionisation energies.
 *
 * One accent, no legend, no gridlines (03-DESIGN.md §9). Every bar is labelled with its own
 * value, so identity and magnitude both survive a greyscale print and neither depends on color.
 */
export function BarsChart({
  spec,
  alt,
  width: available,
}: {
  spec: BarsChartSpec;
  alt: string;
  width: number;
}) {
  // Roughly 140px of plot per category, plus the axis gutters. A two-isotope spectrum then reads
  // as a spectrum rather than as two towers at opposite ends of the page.
  const width = Math.min(available, 160 + spec.series.length * 140);
  const height = Math.round(Math.min(280, Math.max(200, width * 0.5)));
  const padding = { top: 24, right: 12, bottom: 56, left: 52 };

  const values = spec.series.map((entry) => entry.value);
  // Bars are read by length, so the scale starts at zero — always, no exceptions.
  const domain = niceDomain([0, Math.max(...values, 0)]);
  const y = linearScale(domain, [height - padding.bottom, padding.top]);

  const plotWidth = width - padding.left - padding.right;
  const slot = plotWidth / spec.series.length;
  // Thin marks. A mass spectrum's peaks are sticks, not slabs — and with only two isotopes a
  // proportional width would give two enormous blocks that say nothing the labels do not.
  const barWidth = Math.min(28, Math.max(8, slot * 0.3));
  const baseline = y(domain[0]);

  return (
    <ChartFrame
      alt={alt}
      width={width}
      height={height}
      description={spec.series
        .map((entry) => `${entry.label}: ${formatNumber(entry.value)}`)
        .join('; ')}
    >
      {/* One rule, at the baseline. Gridlines would out-number the data. */}
      <line
        x1={padding.left}
        x2={width - padding.right}
        y1={baseline}
        y2={baseline}
        stroke="var(--border-strong)"
        strokeWidth={1}
      />

      {[domain[0], domain[1]].map((tick) => (
        <TickLabel key={tick} x={padding.left - 10} y={y(tick)} anchor="end">
          {formatNumber(tick)}
        </TickLabel>
      ))}

      {spec.series.map((entry, index) => {
        const centre = padding.left + slot * index + slot / 2;
        const top = y(entry.value);
        return (
          <g key={entry.label}>
            <rect
              x={centre - barWidth / 2}
              y={top}
              width={barWidth}
              height={Math.max(0, baseline - top)}
              // Rounded at the data end only; the baseline end stays square and anchored.
              rx={4}
              fill="var(--accent)"
            />
            <rect
              x={centre - barWidth / 2}
              y={baseline - 4}
              width={barWidth}
              height={4}
              fill="var(--accent)"
            />
            <DirectLabel x={centre} y={top - 12} emphasis>
              {formatNumber(entry.value)}
            </DirectLabel>
            <TickLabel x={centre} y={baseline + 18}>
              {entry.label}
            </TickLabel>
          </g>
        );
      })}

      <AxisTitle x={padding.left + plotWidth / 2} y={height - 10}>
        {spec.x}
      </AxisTitle>
      <AxisTitle x={14} y={padding.top + (baseline - padding.top) / 2} rotate>
        {spec.y}
      </AxisTitle>
    </ChartFrame>
  );
}
