import { describe, expect, it } from 'vitest';

import { creditsFor, decide, maxTokensFor } from '@/lib/ai/router';
import type { AppConfig, Caller, GuardrailSnapshot, RouteInput } from '@/lib/ai/router';
import type { EnhanceOptions, NoteContext } from '@/lib/ai/schema';

/**
 * The three-layer guardrail, as a pure function (02-ARCHITECTURE.md §7).
 *
 * `decide()` is where the cost ceiling actually lives. `scripts/test-edge.mjs` proves the whole
 * stack refuses for real, against a real database; this proves the decision itself, in every
 * combination, in milliseconds — including the ones that are awkward to force end to end.
 */
const CONFIG: AppConfig = {
  enhance_enabled: true,
  monthly_cap_cny: 100,
  daily_cap_cny: 6,
  quota: {
    anon: { enhance_per_day: 3, ocr_per_day: 3 },
    verified: { enhance_per_day: 20, ocr_per_day: 20 },
    byok: { enhance_per_day: 1000, ocr_per_day: 1000 },
  },
  credit_weights: { tidy: 0.6, complete: 1, study_guide: 1.4, ocr_page: 0.15, regen: 0.25 },
  pricing: {},
  models: {
    primary: 'deepseek-v4-flash',
    verify: 'deepseek-v4-pro',
    vision: 'deepseek-v4-flash-vision-exp',
    fallback: 'gemini-2.5-flash',
  },
  limits: {
    max_chars: 60_000,
    max_pages: 60,
    max_bytes: 26_214_400,
    max_tokens: {
      tidy: 4000,
      complete: 8000,
      study_guide: 10_000,
      verify: 3000,
      detect: 300,
      ocr: 4000,
    },
    anon_lifetime_calls: 15,
    ip_calls_per_hour: 20,
  },
};

const CONTEXT: NoteContext = {
  subject: 'Chemistry',
  curriculum: 'AP',
  course: 'AP Chemistry',
  unit: 'Unit 1',
  topic: null,
  language: 'en',
};

const OPTIONS: EnhanceOptions = {
  mode: 'complete',
  depth: 'match',
  visuals: 'auto',
  voice: 'keep-mine',
};

const EMPTY: GuardrailSnapshot = {
  monthCostCny: 0,
  dayCostCny: 0,
  creditsLast24h: { enhance: 0, ocr: 0 },
  oldestEventLast24h: null,
  anonLifetimeCalls: 0,
  ipCallsLastHour: 0,
};

const ANON: Caller = { tier: 'anon', userId: null, anonId: 'a1.x.1.y' };
const SIGNED_IN: Caller = { tier: 'verified', userId: 'user-1', anonId: null };
const BYOK: Caller = {
  tier: 'byok',
  userId: null,
  anonId: 'a1.x.1.y',
  byok: { provider: 'deepseek', model: 'deepseek-v4-flash', apiKey: 'sk-theirs' },
};

const NOW = new Date('2026-08-30T12:00:00Z');

function input(caller: Caller, overrides: Partial<RouteInput> = {}): RouteInput {
  return {
    caller,
    kind: 'enhance',
    config: CONFIG,
    context: CONTEXT,
    options: OPTIONS,
    ...overrides,
  };
}

describe('the order of the guardrails', () => {
  it('lets an ordinary first call through', () => {
    const decision = decide(input(ANON), EMPTY, NOW);
    expect(decision.ok).toBe(true);
  });

  it('refuses on the kill switch before anything else is considered', () => {
    const decision = decide(
      { ...input(ANON), config: { ...CONFIG, enhance_enabled: false } },
      { ...EMPTY, monthCostCny: 500, dayCostCny: 500 },
      NOW,
    );
    expect(decision).toMatchObject({ ok: false, reason: 'kill-switch' });
  });

  it('refuses on the monthly ceiling before the daily burst guard', () => {
    const decision = decide(input(ANON), { ...EMPTY, monthCostCny: 100, dayCostCny: 100 }, NOW);
    expect(decision).toMatchObject({ ok: false, reason: 'monthly-cap' });
  });

  it('refuses on the daily cap, and says it resets at midnight UTC', () => {
    const decision = decide(input(ANON), { ...EMPTY, dayCostCny: 6 }, NOW);
    expect(decision).toMatchObject({ ok: false, reason: 'daily-cap' });
    if (decision.ok) return;
    expect(decision.resetsAt).toBe('2026-08-31T00:00:00.000Z');
  });

  it('refuses on the per-tier quota, and resets 24h after the oldest call', () => {
    const decision = decide(
      input(ANON),
      {
        ...EMPTY,
        creditsLast24h: { enhance: 3, ocr: 0 },
        oldestEventLast24h: '2026-08-30T09:15:00Z',
      },
      NOW,
    );
    expect(decision).toMatchObject({ ok: false, reason: 'quota' });
    if (decision.ok) return;
    expect(decision.resetsAt).toBe('2026-08-31T09:15:00.000Z');
  });

  it('lets a call through that exactly fits the remaining allowance', () => {
    const decision = decide(input(ANON), { ...EMPTY, creditsLast24h: { enhance: 2, ocr: 0 } }, NOW);
    expect(decision.ok).toBe(true);
  });

  it('refuses a study guide that would overrun, though a tidy would fit', () => {
    const nearly = { ...EMPTY, creditsLast24h: { enhance: 2, ocr: 0 } };
    const studyGuide = decide(
      { ...input(ANON), options: { ...OPTIONS, mode: 'study_guide' } },
      nearly,
      NOW,
    );
    const tidy = decide({ ...input(ANON), options: { ...OPTIONS, mode: 'tidy' } }, nearly, NOW);
    expect(studyGuide.ok).toBe(false);
    expect(tidy.ok).toBe(true);
  });

  it('counts OCR against its own line, not the enhancement allowance', () => {
    const spentOnNotes = { ...EMPTY, creditsLast24h: { enhance: 3, ocr: 0 } };
    expect(decide({ ...input(ANON), kind: 'ocr' }, spentOnNotes, NOW).ok).toBe(true);
    expect(decide(input(ANON), spentOnNotes, NOW).ok).toBe(false);
  });

  it('gives a signed-in student the larger allowance', () => {
    const spent = { ...EMPTY, creditsLast24h: { enhance: 5, ocr: 0 } };
    expect(decide(input(ANON), spent, NOW).ok).toBe(false);
    expect(decide(input(SIGNED_IN), spent, NOW).ok).toBe(true);
  });

  it('stops an anonymous browser at its lifetime cap', () => {
    const decision = decide(input(ANON), { ...EMPTY, anonLifetimeCalls: 15 }, NOW);
    expect(decision).toMatchObject({ ok: false, reason: 'quota' });
  });

  it('does not apply the lifetime cap to someone signed in', () => {
    expect(decide(input(SIGNED_IN), { ...EMPTY, anonLifetimeCalls: 99 }, NOW).ok).toBe(true);
  });

  it('rate-limits by IP', () => {
    const decision = decide(input(ANON), { ...EMPTY, ipCallsLastHour: 20 }, NOW);
    expect(decision).toMatchObject({ ok: false, reason: 'rate-limited' });
  });
});

describe('BYOK', () => {
  it('is unaffected by both caps and by the quota', () => {
    const exhausted: GuardrailSnapshot = {
      monthCostCny: 9999,
      dayCostCny: 9999,
      creditsLast24h: { enhance: 999, ocr: 999 },
      oldestEventLast24h: null,
      anonLifetimeCalls: 999,
      ipCallsLastHour: 0,
    };
    expect(decide(input(BYOK), exhausted, NOW).ok).toBe(true);
  });

  it('is still rate-limited, because a leaked key of ours is not the only kind of abuse', () => {
    const decision = decide(input(BYOK), { ...EMPTY, ipCallsLastHour: 20 }, NOW);
    expect(decision).toMatchObject({ ok: false, reason: 'rate-limited' });
  });

  it('keeps working when the kill switch is off, because it is not our spend', () => {
    const decision = decide(
      { ...input(BYOK), config: { ...CONFIG, enhance_enabled: false } },
      EMPTY,
      NOW,
    );
    expect(decision.ok).toBe(true);
  });
});

describe('what a call costs the allowance', () => {
  it.each([
    ['tidy', 0.6],
    ['complete', 1],
    ['study_guide', 1.4],
  ])('%s costs %s credits', (mode, credits) => {
    expect(
      creditsFor({
        kind: 'enhance',
        options: { ...OPTIONS, mode: mode as EnhanceOptions['mode'] },
        config: CONFIG,
      }),
    ).toBe(credits);
  });

  it('charges a regeneration a quarter', () => {
    expect(creditsFor({ kind: 'regen', options: OPTIONS, config: CONFIG })).toBe(0.25);
  });

  it('charges nothing for detection or verification — those are machinery', () => {
    expect(creditsFor({ kind: 'detect', options: OPTIONS, config: CONFIG })).toBe(0);
    expect(creditsFor({ kind: 'verify', options: OPTIONS, config: CONFIG })).toBe(0);
  });
});

describe('output caps', () => {
  it.each([
    ['tidy', 4000],
    ['complete', 8000],
    ['study_guide', 10_000],
  ])('caps %s at %i tokens', (mode, tokens) => {
    expect(
      maxTokensFor({
        kind: 'enhance',
        options: { ...OPTIONS, mode: mode as EnhanceOptions['mode'] },
        config: CONFIG,
      }),
    ).toBe(tokens);
  });

  it('caps the verify pass separately', () => {
    expect(maxTokensFor({ kind: 'verify', options: OPTIONS, config: CONFIG })).toBe(3000);
  });
});
