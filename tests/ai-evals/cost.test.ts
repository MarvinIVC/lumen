import { describe, expect, it } from 'vitest';

import { CASES } from './cases';
import { REGRESSION_LIMIT, costOfRun, median, readBaseline, writeBaseline } from './cost';
import { recordedProvider, runCase } from './run-fixture';

/**
 * The cost regression check (04-AI-ENGINE.md §9).
 *
 * A prompt that quietly grows is invisible in the output and obvious in the bill, so the median
 * cost per call is a number the build defends. Against recorded responses this is primarily an
 * *input-side* check — the prompt really is assembled, so a pack block that doubles or a rubric
 * that sprawls shows up here — and the nightly live run checks the output side.
 *
 * `UPDATE_COST_BASELINE=1 pnpm test:ai` rewrites the baseline. Do that deliberately, with the
 * measured numbers in the pull request, not to make a red build green.
 */
describe('cost per call', () => {
  it('has not regressed by more than 25%', async () => {
    const perCase: Record<string, number> = {};

    for (const evalCase of CASES) {
      const result = await runCase(evalCase, recordedProvider(evalCase.id));
      perCase[evalCase.id] = costOfRun(result.usage);
    }

    const measured = median(Object.values(perCase));

    if (process.env.UPDATE_COST_BASELINE) {
      writeBaseline({
        measuredOn: new Date().toISOString().slice(0, 10),
        note: 'Measured against the recorded responses at peak DeepSeek rates. Regenerate with UPDATE_COST_BASELINE=1 pnpm test:ai.',
        perCase,
        medianCny: measured,
      });
    }

    const baseline = readBaseline();
    const limit = baseline.medianCny * REGRESSION_LIMIT;

    expect(
      measured,
      `median ${measured.toFixed(5)} CNY against a baseline of ${baseline.medianCny.toFixed(5)} (limit ${limit.toFixed(5)}). Per case: ${JSON.stringify(perCase)}`,
    ).toBeLessThanOrEqual(limit);
  }, 120_000);

  it('stays inside the per-call budget the architecture assumes', async () => {
    const result = await runCase(CASES[0]!, recordedProvider(CASES[0]!.id));
    // 02 §7 budgets ~4,000 input and ~7,000 output tokens for a thorough lesson. At peak rates
    // that is about 0.075 CNY; a call that costs twice the budget would blow the monthly ceiling
    // long before the daily cap noticed.
    expect(costOfRun(result.usage)).toBeLessThan(0.15);
  }, 60_000);
});
