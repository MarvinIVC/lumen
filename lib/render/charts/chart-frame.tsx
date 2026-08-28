import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

export interface ChartFrameProps {
  /** The block's `alt` — the whole point of the chart, said in words. */
  alt: string;
  width: number;
  height: number;
  /** Rendered as `<desc>`: the numbers, so the chart is not the only way to get them. */
  description?: string;
  className?: string;
  children: ReactNode;
}

/**
 * The shell every chart shares: an `<svg role="img">` whose accessible name is the block's alt
 * text and whose `<desc>` carries the actual values (06 §1). A student using a screen reader gets
 * the reading, not "image".
 */
export function ChartFrame({
  alt,
  width,
  height,
  description,
  className,
  children,
}: ChartFrameProps) {
  return (
    <svg
      role="img"
      aria-label={alt}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn('mx-auto block h-auto w-full overflow-visible', className)}
      // 1 unit = 1px at the measured width, so type stays true size at every viewport. The cap
      // matters for charts with few categories: two bars stretched across 900px is a chart made
      // mostly of whitespace, and the eye reads the gap as meaning.
      style={{ maxWidth: width }}
      preserveAspectRatio="xMidYMid meet"
    >
      <title>{alt}</title>
      {description ? <desc>{description}</desc> : null}
      {children}
    </svg>
  );
}

/** Axis title. Always present — an unlabelled axis is a chart you cannot check (06 §1). */
export function AxisTitle({
  x,
  y,
  rotate = false,
  children,
}: {
  x: number;
  y: number;
  rotate?: boolean;
  children: ReactNode;
}) {
  return (
    <text
      x={x}
      y={y}
      fill="var(--text-muted)"
      fontSize={12}
      fontFamily="var(--font-sans)"
      textAnchor="middle"
      transform={rotate ? `rotate(-90 ${x} ${y})` : undefined}
    >
      {children}
    </text>
  );
}

/** A tick label. Recessive by design — the data is the thing being read, not the scaffolding. */
export function TickLabel({
  x,
  y,
  anchor = 'middle',
  children,
}: {
  x: number;
  y: number;
  anchor?: 'start' | 'middle' | 'end';
  children: ReactNode;
}) {
  return (
    <text
      x={x}
      y={y}
      fill="var(--text-muted)"
      fontSize={11}
      fontFamily="var(--font-sans)"
      textAnchor={anchor}
      dominantBaseline="middle"
    >
      {children}
    </text>
  );
}

/** A value written on the mark itself. Beats a legend, and survives a black-and-white print. */
export function DirectLabel({
  x,
  y,
  anchor = 'middle',
  emphasis = false,
  children,
}: {
  x: number;
  y: number;
  anchor?: 'start' | 'middle' | 'end';
  emphasis?: boolean;
  children: ReactNode;
}) {
  return (
    <text
      x={x}
      y={y}
      // Text wears ink, never the series color — the mark beside it already carries identity.
      fill={emphasis ? 'var(--text)' : 'var(--text-muted)'}
      fontSize={12}
      fontWeight={emphasis ? 600 : 400}
      fontFamily="var(--font-sans)"
      textAnchor={anchor}
      dominantBaseline="middle"
    >
      {children}
    </text>
  );
}
