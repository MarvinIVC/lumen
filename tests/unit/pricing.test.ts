import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { estimateCost, isPeak, rateCard } from '@/lib/ai/router';
import type { PricingTable } from '@/lib/ai/router';

/**
 * The rate card in `app_config`, checked against what DeepSeek actually charges.
 *
 * These numbers were verified against api-docs.deepseek.com on 2026-08-28 and again on 2026-08-30.
 * They matter more than they look: the whole cost model in 02 §7 was written against list prices
 * roughly 3x cheaper on input and 4.7x cheaper on output than the real ones, and the caps were
 * re-derived from these. A silent edit to this row moves the ceiling.
 *
 * The nightly workflow runs this after the live evals, so a price change shows up as a red build
 * rather than as a surprise at the end of a month.
 */
const ROOT = resolve(import.meta.dirname, '../..');
const migration = readFileSync(resolve(ROOT, 'supabase/migrations/0000_init.sql'), 'utf8');

function seededJson(key: string): Record<string, unknown> {
  const pattern = new RegExp(`\\('${key}',\\s*\\$json\\$([\\s\\S]*?)\\$json\\$::jsonb\\)`);
  const match = pattern.exec(migration);
  if (!match?.[1]) throw new Error(`app_config.${key} is not seeded in 0000_init.sql`);
  return JSON.parse(match[1]) as Record<string, unknown>;
}

const pricing = seededJson('pricing') as PricingTable;
const models = seededJson('models') as Record<string, string>;

/** USD list prices, per million tokens, off-peak and peak. */
const VERIFIED_USD = {
  'deepseek-v4-flash': { hit: [0.007, 0.014], miss: [0.22, 0.44], out: [0.66, 1.32] },
  'deepseek-v4-pro': { hit: [0.022, 0.044], miss: [0.66, 1.32], out: [1.98, 3.96] },
} as const;

const FX = 6.72;

describe('the seeded rate card', () => {
  it.each(Object.keys(VERIFIED_USD))('prices %s at the verified rates', (model) => {
    const card = pricing[model];
    expect(card && 'peak' in card, `${model} is missing from app_config.pricing`).toBe(true);
    if (!card || !('peak' in card)) return;

    const usd = VERIFIED_USD[model as keyof typeof VERIFIED_USD];
    expect(card.off_peak.in_hit).toBeCloseTo(usd.hit[0] * FX, 4);
    expect(card.peak.in_hit).toBeCloseTo(usd.hit[1] * FX, 4);
    expect(card.off_peak.in_miss).toBeCloseTo(usd.miss[0] * FX, 4);
    expect(card.peak.in_miss).toBeCloseTo(usd.miss[1] * FX, 4);
    expect(card.off_peak.out).toBeCloseTo(usd.out[0] * FX, 4);
    expect(card.peak.out).toBeCloseTo(usd.out[1] * FX, 4);
  });

  it('records the exchange rate and the day it was verified', () => {
    expect(pricing._meta?.fx_usd_cny).toBe(FX);
    expect(pricing._meta?.verified_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('keeps off-peak at exactly half of peak', () => {
    for (const model of Object.keys(VERIFIED_USD)) {
      const card = pricing[model];
      if (!card || !('peak' in card)) continue;
      expect(card.off_peak.in_miss * 2).toBeCloseTo(card.peak.in_miss, 4);
      expect(card.off_peak.out * 2).toBeCloseTo(card.peak.out, 4);
    }
  });

  it('names models that exist', () => {
    // 02-ARCHITECTURE.md §2 calls the vision model `deepseek-vision-exp`, which is not a published
    // id. Phase-00 corrected it in the seed; this stops it drifting back.
    expect(models.primary).toBe('deepseek-v4-flash');
    expect(models.verify).toBe('deepseek-v4-pro');
    expect(models.vision).toBe('deepseek-v4-flash-vision-exp');
    expect(models.fallback).toBe('gemini-2.5-flash');
  });
});

describe('peak and off-peak', () => {
  it.each([
    ['2026-09-01T02:30:00Z', true, 'Tuesday inside 01:00-04:00'],
    ['2026-09-01T07:00:00Z', true, 'Tuesday inside 06:00-10:00'],
    ['2026-09-01T05:00:00Z', false, 'Tuesday in the gap between the windows'],
    ['2026-09-01T23:00:00Z', false, 'Tuesday night'],
    ['2026-09-05T02:30:00Z', false, 'Saturday — the windows are Mon-Fri'],
  ])('%s → peak: %s (%s)', (iso, expected) => {
    expect(isPeak(new Date(iso), pricing)).toBe(expected);
  });

  it('falls back to the known windows if the meta string is unparseable', () => {
    const broken = { ...pricing, _meta: { ...pricing._meta!, peak_hours_utc: 'sometimes' } };
    expect(isPeak(new Date('2026-09-01T02:30:00Z'), broken)).toBe(true);
  });
});

describe('estimateCost', () => {
  const peak = new Date('2026-09-01T02:30:00Z');
  const offPeak = new Date('2026-09-01T23:00:00Z');

  it('prices a cache hit far below a miss', () => {
    const missed = estimateCost('deepseek-v4-flash', 10_000, 0, 0, pricing, peak);
    const cached = estimateCost('deepseek-v4-flash', 10_000, 0, 10_000, pricing, peak);
    expect(missed / cached).toBeGreaterThan(30);
  });

  it('splits a partial cache hit at the two rates', () => {
    const card = rateCard('deepseek-v4-flash', pricing, peak);
    const expected = (8000 * card.in_hit + 2000 * card.in_miss) / 1_000_000;
    expect(estimateCost('deepseek-v4-flash', 10_000, 0, 8000, pricing, peak)).toBeCloseTo(
      expected,
      5,
    );
  });

  it('halves off-peak', () => {
    const atPeak = estimateCost('deepseek-v4-flash', 4000, 7000, 0, pricing, peak);
    const atNight = estimateCost('deepseek-v4-flash', 4000, 7000, 0, pricing, offPeak);
    expect(atNight * 2).toBeCloseTo(atPeak, 5);
  });

  it('prices an unknown model at zero, because BYOK is not our spend', () => {
    expect(estimateCost('someones-own-model', 10_000, 10_000, 0, pricing, peak)).toBe(0);
  });

  it('never lets a cache hit exceed the tokens it was reported against', () => {
    const sane = estimateCost('deepseek-v4-flash', 1000, 0, 99_999, pricing, peak);
    const all = estimateCost('deepseek-v4-flash', 1000, 0, 1000, pricing, peak);
    expect(sane).toBe(all);
  });

  it('keeps a typical enhancement inside the per-call budget 02 §7 assumes', () => {
    // ~2,500 uncached input + ~1,500 cached + ~7,000 output, at peak.
    const cost = estimateCost('deepseek-v4-flash', 4000, 7000, 1500, pricing, peak);
    expect(cost).toBeLessThan(0.09);
  });
});
