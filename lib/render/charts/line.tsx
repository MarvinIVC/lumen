import type { LineChartSpec } from '@/lib/ai/schema';

import { AxisTitle, ChartFrame, DirectLabel, TickLabel } from './chart-frame';
import { extent, formatNumber, linearScale, niceDomain, ticks } from './scale';

/**
 * A continuous series: a titration curve, a rate plot. Annotations mark the x worth naming — an
 * equivalence point, a half-life — because that is usually the reason the chart exists at all.
 */
export function LineChart({
  spec,
  alt,
  width,
}: {
  spec: LineChartSpec;
  alt: string;
  width: number;
}) {
  const height = Math.round(Math.min(300, Math.max(210, width * 0.52)));
  const padding = { top: 24, right: 20, bottom: 52, left: 52 };

  const points = [...spec.points].sort((a, b) => a.x - b.x);
  const xDomain = niceDomain(extent(points.map((p) => p.x)));
  const yDomain = niceDomain(extent(points.map((p) => p.y)));
  const x = linearScale(xDomain, [padding.left, width - padding.right]);
  const y = linearScale(yDomain, [height - padding.bottom, padding.top]);

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.x)} ${y(p.y)}`).join(' ');
  const xTicks = ticks(xDomain, width < 420 ? 2 : 4);
  const yTicks = ticks(yDomain, 3);

  return (
    <ChartFrame
      alt={alt}
      width={width}
      height={height}
      description={points.map((p) => `${formatNumber(p.x)}, ${formatNumber(p.y)}`).join('; ')}
    >
      <line
        x1={padding.left}
        x2={width - padding.right}
        y1={height - padding.bottom}
        y2={height - padding.bottom}
        stroke="var(--border-strong)"
        strokeWidth={1}
      />

      {yTicks.map((tick) => (
        <TickLabel key={tick} x={padding.left - 10} y={y(tick)} anchor="end">
          {formatNumber(tick)}
        </TickLabel>
      ))}
      {xTicks.map((tick) => (
        <TickLabel key={tick} x={x(tick)} y={height - padding.bottom + 18}>
          {formatNumber(tick)}
        </TickLabel>
      ))}

      {/* Annotations sit behind the curve so they never interrupt the line being read. */}
      {spec.annotations?.map((annotation) => (
        <g key={`${annotation.x}-${annotation.label}`}>
          <line
            x1={x(annotation.x)}
            x2={x(annotation.x)}
            y1={padding.top}
            y2={height - padding.bottom}
            stroke="var(--border-strong)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <DirectLabel x={x(annotation.x)} y={padding.top - 10}>
            {annotation.label}
          </DirectLabel>
        </g>
      ))}

      <path
        d={path}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <AxisTitle x={padding.left + (width - padding.left - padding.right) / 2} y={height - 10}>
        {spec.x}
      </AxisTitle>
      <AxisTitle x={14} y={padding.top + (height - padding.bottom - padding.top) / 2} rotate>
        {spec.y}
      </AxisTitle>
    </ChartFrame>
  );
}
