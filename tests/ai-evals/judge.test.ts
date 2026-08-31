import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CASES } from './cases';
import {
  JUDGE_DIMENSIONS,
  createLiveJudge,
  createMockJudge,
  gateJudgement,
  parseJudgement,
} from './judge';
import { recordedProvider, runCase } from './run-fixture';

/**
 * The judge half of the release gate (04-AI-ENGINE.md §9).
 *
 * In CI the judge is mocked, and what is being tested is the gate rather than the model: that the
 * rubric parses, that an average below 4 fails, that a single dimension below 3 fails even when
 * the average is fine. A live judge here would make every pull request depend on a third party and
 * would score the same bytes differently twice — a flaky gate is worse than no gate.
 *
 * The live judging happens nightly, against live output, and is skipped without a key.
 */
const ROOT = resolve(import.meta.dirname, '../..');

describe('the gate', () => {
  it('passes work that scores well', () => {
    const gate = gateJudgement({
      scores: {
        completeness: 5,
        factualAccuracy: 5,
        faithfulness: 4,
        pedagogicalClarity: 4,
        visualAppropriateness: 4,
        provenanceCorrectness: 4,
      },
      notes: '',
    });
    expect(gate.ok).toBe(true);
    expect(gate.average).toBeGreaterThanOrEqual(4);
  });

  it('fails an average below 4', () => {
    const gate = gateJudgement({
      scores: {
        completeness: 4,
        factualAccuracy: 4,
        faithfulness: 3,
        pedagogicalClarity: 4,
        visualAppropriateness: 3,
        provenanceCorrectness: 3,
      },
      notes: '',
    });
    expect(gate.ok).toBe(false);
    expect(gate.reasons.join(' ')).toContain('below 4');
  });

  it('fails one weak dimension even when the average is comfortable', () => {
    const gate = gateJudgement({
      scores: {
        completeness: 5,
        factualAccuracy: 2,
        faithfulness: 5,
        pedagogicalClarity: 5,
        visualAppropriateness: 5,
        provenanceCorrectness: 5,
      },
      notes: '',
    });
    expect(gate.ok).toBe(false);
    expect(gate.lowest).toEqual({ dimension: 'factualAccuracy', score: 2 });
  });

  it('rejects a judgement that is missing a dimension', () => {
    expect(parseJudgement({ scores: { completeness: 5 } })).toBeNull();
  });

  it('rejects a score outside the scale', () => {
    const scores = Object.fromEntries(JUDGE_DIMENSIONS.map((d) => [d, 4]));
    expect(parseJudgement({ scores: { ...scores, completeness: 9 } })).toBeNull();
  });
});

describe('judging a fixture', () => {
  it('runs the rubric over a real document and gates on the result', async () => {
    const evalCase = CASES.find((entry) => entry.id === 'ap-chem-u1')!;
    const result = await runCase(evalCase, recordedProvider(evalCase.id));
    expect(result.document).not.toBeNull();

    const judge = createMockJudge({ default: { completeness: 5, factualAccuracy: 5 } });
    const judgement = await judge({
      raw: evalCase.raw,
      reference: readFileSync(resolve(ROOT, 'fixtures/ap-chem-u1-gold.md'), 'utf8'),
      document: result.document!,
    });

    expect(judgement).not.toBeNull();
    expect(gateJudgement(judgement!).ok).toBe(true);
  });
});

/**
 * The nightly run. Skipped everywhere else, and deliberately not marked as a pass when it is —
 * a skipped judge is an unjudged build, and the workflow that cares knows the difference.
 *
 * **`EVAL_LIVE=1` is required, and the presence of keys is not enough.** Vitest loads `.env.local`
 * into `process.env`, so the moment a developer put real keys in that file, `pnpm test:ai` started
 * quietly running seven paid generations instead of the recorded ones — slowly, non-deterministically
 * and at a cost that grows with every fixture added. A live run has to be asked for.
 */
const live = createLiveJudge();
const liveRequested = process.env.EVAL_LIVE === '1';
describe.skipIf(!liveRequested || !live || !process.env.DEEPSEEK_API_KEY)(
  'live judging (nightly)',
  () => {
    for (const evalCase of CASES.filter((entry) => !entry.expectRefusal)) {
      const reference = resolve(ROOT, 'fixtures', `${evalCase.id.replace(/-u1$/, '-u1')}-good.md`);
      const gold = resolve(ROOT, 'fixtures/ap-chem-u1-gold.md');
      const referenceFile = existsSync(reference) ? reference : gold;

      it(`${evalCase.id} scores at least 4 with nothing below 3`, async () => {
        const { liveProvider } = await import('./run-fixture');
        const provider = liveProvider();
        expect(provider).not.toBeNull();

        const result = await runCase(evalCase, provider!);
        expect(result.document).not.toBeNull();

        const judgement = await live!({
          raw: evalCase.raw,
          reference: readFileSync(referenceFile, 'utf8'),
          document: result.document!,
        });
        expect(judgement, 'the judge did not return a usable score').not.toBeNull();

        const gate = gateJudgement(judgement!);
        expect(gate.ok, `${gate.reasons.join('; ')} — ${judgement!.notes}`).toBe(true);
      }, 300_000);
    }
  },
);
