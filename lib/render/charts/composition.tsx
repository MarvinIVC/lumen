import type { CompositionChartSpec } from '@/lib/ai/schema';

import { ChartFrame, DirectLabel } from './chart-frame';

const BAR_HEIGHT = 28;
const ROW_HEIGHT = 22;
const SEGMENT_GAP = 2;

/**
 * Parts of a whole — a mixture, a percent composition. One 100% bar plus a labelled row per part.
 *
 * Two decisions worth knowing about. The parts are ordered largest first and shaded down a single
 * accent ramp, which is the sequential treatment magnitude deserves; a rainbow of categorical hues
 * would imply the parts are unrelated kinds rather than shares of one sample. And identity is
 * carried by the label text in the rows below, never by color alone — so the figure still reads
 * in greyscale, in print, and to a colorblind reader.
 */
export function CompositionChart({
  spec,
  alt,
  width: available,
}: {
  spec: CompositionChartSpec;
  alt: string;
  width: number;
}) {
  // A 100% bar wider than a reading measure stops being comparable at a glance.
  const width = Math.min(available, 560);
  const parts = [...spec.parts].sort((a, b) => b.fraction - a.fraction);
  const total = parts.reduce((sum, part) => sum + part.fraction, 0) || 1;
  const height = BAR_HEIGHT + 16 + parts.length * ROW_HEIGHT;

  let offset = 0;
  const segments = parts.map((part, index) => {
    const share = part.fraction / total;
    const segment = {
      ...part,
      share,
      x: offset * width,
      segmentWidth: Math.max(0, share * width - SEGMENT_GAP),
      // 100% down to 40% of the accent, mixed into the sunken surface rather than into white, so
      // the ramp holds its warmth in both themes.
      fill: `color-mix(in oklab, var(--accent) ${Math.round(
        100 - (index / Math.max(1, parts.length - 1)) * 60,
      )}%, var(--bg-sunken))`,
    };
    offset += share;
    return segment;
  });

  return (
    <ChartFrame
      alt={alt}
      width={width}
      height={height}
      description={parts
        .map((part) => `${part.label}: ${(part.fraction * 100).toFixed(1)}%`)
        .join('; ')}
    >
      {segments.map((segment) => (
        <rect
          key={segment.label}
          x={segment.x}
          y={0}
          width={segment.segmentWidth}
          height={BAR_HEIGHT}
          rx={2}
          fill={segment.fill}
        />
      ))}

      {segments.map((segment, index) => {
        const rowY = BAR_HEIGHT + 16 + index * ROW_HEIGHT + ROW_HEIGHT / 2;
        return (
          <g key={`row-${segment.label}`}>
            <rect x={0} y={rowY - 5} width={10} height={10} rx={2} fill={segment.fill} />
            <DirectLabel x={18} y={rowY} anchor="start" emphasis>
              {segment.label}
            </DirectLabel>
            <DirectLabel x={width} y={rowY} anchor="end">
              {`${(segment.share * 100).toFixed(1)}%`}
            </DirectLabel>
          </g>
        );
      })}
    </ChartFrame>
  );
}
