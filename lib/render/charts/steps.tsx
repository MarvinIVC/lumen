import type { StepsChartSpec } from '@/lib/ai/schema';

import { AxisTitle, ChartFrame, TickLabel } from './chart-frame';
import { extent, formatNumber, linearScale, niceDomain, ticks } from './scale';

/**
 * A step function: a photoelectron spectrum, an energy ladder. Drawn as risers and treads rather
 * than an interpolated curve, because the flat stretches are the physics — a smooth line between
 * two shells would claim values that do not exist.
 */
export function StepsChart({
  spec,
  alt,
  width,
}: {
  spec: StepsChartSpec;
  alt: string;
  width: number;
}) {
  const height = Math.round(Math.min(300, Math.max(210, width * 0.52)));
  const padding = { top: 24, right: 20, bottom: 52, left: 56 };

  const points = [...spec.points].sort((a, b) => a.x - b.x);
  const xDomain = niceDomain(extent(points.map((p) => p.x)));
  const yDomain = niceDomain([0, Math.max(...points.map((p) => p.y), 0)]);
  const x = linearScale(xDomain, [padding.left, width - padding.right]);
  const y = linearScale(yDomain, [height - padding.bottom, padding.top]);

  const path = points
    .flatMap((point, index) => {
      const previous = points[index - 1];
      if (!previous) return [`M${x(point.x)} ${y(point.y)}`];
      // Tread across at the previous height, then the riser up or down. Order matters: the other
      // way round would put the jump at the wrong x.
      return [`L${x(point.x)} ${y(previous.y)}`, `L${x(point.x)} ${y(point.y)}`];
    })
    .join(' ');

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

      {ticks(yDomain, 3).map((tick) => (
        <TickLabel key={tick} x={padding.left - 10} y={y(tick)} anchor="end">
          {formatNumber(tick)}
        </TickLabel>
      ))}
      {ticks(xDomain, width < 420 ? 2 : 4).map((tick) => (
        <TickLabel key={tick} x={x(tick)} y={height - padding.bottom + 18}>
          {formatNumber(tick)}
        </TickLabel>
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
