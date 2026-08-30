import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CASES } from './cases';
import { studyToolChecks, universalChecks } from './hard-checks';
import { recordedProvider, runCase } from './run-fixture';
import type { CheckResult } from './hard-checks';

/**
 * The release gate (04-AI-ENGINE.md §9).
 *
 * Every fixture is driven through the real pipeline against its recorded response, and every hard
 * check must pass. A failure here is a prompt change that broke something specific and nameable —
 * the mnemonic stopped surviving, a formula lost its units, a quotation was invented — which is
 * the point of writing them as checks rather than as a judge's opinion.
 *
 * The recorded responses are chunked into 37-byte pieces on the way in, so every run of this suite
 * also exercises the tolerant streaming parser against real content.
 */
const ROOT = resolve(import.meta.dirname, '../..');

function report(results: CheckResult[]): string {
  return results
    .filter((result) => !result.ok)
    .map((result) => `  ✗ ${result.name}${result.detail ? `: ${result.detail}` : ''}`)
    .join('\n');
}

describe.each(CASES)('$id', (evalCase) => {
  const recordingExists = existsSync(
    resolve(ROOT, 'tests/ai-evals/recorded', `${evalCase.id}.json`),
  );

  it('has a recorded response to replay', () => {
    expect(recordingExists).toBe(true);
  });

  if (!recordingExists) return;

  if (evalCase.expectRefusal) {
    it('is declined, and nothing is charged for it', async () => {
      const result = await runCase(evalCase, recordedProvider(evalCase.id));
      expect(result.refused).toBeTruthy();
      expect(result.document).toBeNull();
      expect(result.usage?.charged).toBe(false);
    });
    return;
  }

  it('produces a document that passes every hard check', async () => {
    const result = await runCase(evalCase, recordedProvider(evalCase.id));
    expect(result.error, result.error?.message).toBeNull();
    expect(result.document).not.toBeNull();
    const doc = result.document!;

    const results = [
      ...universalChecks(doc, evalCase.raw),
      ...(evalCase.expectStudyTools ? studyToolChecks(doc) : []),
      ...evalCase.assertions(doc),
    ];
    const failures = report(results);
    expect(failures, `\n${failures}`).toBe('');
  });

  it('streams its sections in order, each exactly once', async () => {
    const result = await runCase(evalCase, recordedProvider(evalCase.id));
    const expected = result.document?.sections.length ?? 0;
    expect(result.streamedSections).toEqual([...Array(expected).keys()]);
  });
});
