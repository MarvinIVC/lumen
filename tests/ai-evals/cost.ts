/**
 * The cost regression check (04-AI-ENGINE.md §9, 02-ARCHITECTURE.md §7).
 *
 * A prompt change that quietly doubles the output tokens is invisible in the output and obvious in
 * the bill a month later, so the median cost per call is a number the build knows and defends. The
 * gate is >25% above the recorded baseline.
 *
 * The baseline is measured, not guessed: `pnpm test:ai --update-cost` writes it from the current
 * run. In CI the numbers come from the recorded responses, which makes the check a *prompt-size*
 * regression test — the input side is real, since the prompt is assembled for real. The nightly
 * live run is what checks the output side against a real model.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { estimateCost } from '@/lib/ai/router';
import type { PricingTable } from '@/lib/ai/router';
import type { RunUsage } from '@/lib/ai/enhance';

const ROOT = resolve(import.meta.dirname, '../..');
const BASELINE = resolve(ROOT, 'tests/ai-evals/cost-baseline.json');

/** The verified rates from `app_config.pricing`, peak, so the number is the pessimistic one. */
export const EVAL_PRICING: PricingTable = {
  'deepseek-v4-flash': {
    peak: { in_miss: 2.9568, in_hit: 0.09408, out: 8.8704 },
    off_peak: { in_miss: 1.4784, in_hit: 0.04704, out: 4.4352 },
  },
  'deepseek-v4-pro': {
    peak: { in_miss: 8.8704, in_hit: 0.29568, out: 26.6112 },
    off_peak: { in_miss: 4.4352, in_hit: 0.14784, out: 13.3056 },
  },
  _meta: {
    currency: 'CNY',
    fx_usd_cny: 6.72,
    verified_on: '2026-08-30',
    peak_hours_utc: '01:00-04:00 and 06:00-10:00, Mon-Fri',
  },
};

/** Peak, always, so a baseline recorded off-peak cannot flatter a run measured at peak. */
const PEAK_MOMENT = new Date('2026-08-31T02:00:00Z');

export interface CostBaseline {
  measuredOn: string;
  note: string;
  /** CNY per call, per fixture. */
  perCase: Record<string, number>;
  medianCny: number;
}

export function costOfRun(usage: RunUsage | null): number {
  if (!usage) return 0;
  let total = 0;
  for (const [model, tokens] of Object.entries(usage.byModel)) {
    total += estimateCost(
      model,
      tokens.tokensIn,
      tokens.tokensOut,
      tokens.cachedTokensIn,
      EVAL_PRICING,
      PEAK_MOMENT,
    );
  }
  return Math.round(total * 100_000) / 100_000;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

export function readBaseline(): CostBaseline {
  return JSON.parse(readFileSync(BASELINE, 'utf8')) as CostBaseline;
}

export function writeBaseline(baseline: CostBaseline): void {
  writeFileSync(BASELINE, `${JSON.stringify(baseline, null, 2)}\n`);
}

/** §9: "fail the build if median cost/call regresses > 25%". */
export const REGRESSION_LIMIT = 1.25;
