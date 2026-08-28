/**
 * The small amount of maths a hand-rolled chart needs. No charting library (06 §1) — these four
 * functions are the entire reason one would have been added.
 */

export interface LinearScale {
  (value: number): number;
  domain: [number, number];
  range: [number, number];
}

export function linearScale(domain: [number, number], range: [number, number]): LinearScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  // A zero-width domain would divide by zero; a single-valued series still deserves a chart.
  const span = d1 - d0 || 1;
  const scale = ((value: number) => r0 + ((value - d0) / span) * (r1 - r0)) as LinearScale;
  scale.domain = domain;
  scale.range = range;
  return scale;
}

export function extent(values: number[]): [number, number] {
  if (values.length === 0) return [0, 1];
  return [Math.min(...values), Math.max(...values)];
}

/**
 * Round a domain outward to human numbers — 0…75.8 becomes 0…80, not 0…75.8. Charts that end on
 * their maximum look like the data was clipped there.
 */
export function niceDomain([min, max]: [number, number], tickCount = 4): [number, number] {
  if (min === max) return [Math.min(0, min), max || 1];
  const step = niceStep((max - min) / tickCount);
  return [Math.floor(min / step) * step, Math.ceil(max / step) * step];
}

function niceStep(rough: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(Math.abs(rough) || 1));
  const normalised = rough / magnitude;
  const snapped = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return snapped * magnitude;
}

/** Tick values across a domain, inclusive of both ends when they land on the step. */
export function ticks([min, max]: [number, number], count = 4): number[] {
  const step = niceStep((max - min) / count);
  const out: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max + step / 1000; value += step) {
    // Floating point leaves 0.30000000000000004 lying around; charts must not print that.
    out.push(Number(value.toPrecision(12)));
  }
  return out;
}

/** Compact number formatting for axis ticks and direct labels. */
export function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 1) return value.toFixed(1);
  return value.toFixed(2);
}
