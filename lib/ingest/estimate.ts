/**
 * "~1 credit · ~30 s", live on the review screen (01-PRODUCT.md §2 step 3).
 *
 * A static formula, and it says so on the screen. The real number needs the token counts only the
 * provider can give, which is phase-04; what this has to get right now is the *shape* — that
 * "thorough" costs more than "brief", that a study guide costs more than a tidy-up, and that OCR
 * on nine scanned pages is not free. A student choosing options should be able to see the price
 * move.
 *
 * The constants mirror `app_config` (`supabase/migrations/0000_init.sql`) rather than being read
 * from it: this runs before any network call exists in the flow, and a wrong-by-20% estimate
 * shown instantly is worth more than an exact one shown after a round trip. Phase-04 replaces the
 * whole function with the router's own accounting.
 */
import type { Depth, EnhanceMode, EnhanceOptions } from '@/lib/ai/schema';

/** From `app_config.credit_weights`. */
const CREDIT_WEIGHTS: Record<EnhanceMode | 'ocr_page', number> = {
  tidy: 0.6,
  complete: 1.0,
  study_guide: 1.4,
  ocr_page: 0.15,
};

/** From `app_config.limits.max_tokens`. The output cap is what actually bounds the cost. */
const MAX_OUTPUT_TOKENS: Record<EnhanceMode, number> = {
  tidy: 4000,
  complete: 8000,
  study_guide: 10_000,
};

/** CNY per million tokens, `deepseek-v4-flash` at peak — the pessimistic half of the rate card. */
const RATE_IN_MISS = 2.9568;
const RATE_OUT = 8.8704;

/** The system prompt, rubric and pack block. Mostly cache hits, so counted at the hit rate. */
const FIXED_PROMPT_TOKENS = 1800;
const RATE_IN_HIT = 0.09408;

/** How much output each mode produces relative to its input, before the depth multiplier. */
const OUTPUT_RATIO: Record<EnhanceMode, number> = { tidy: 1.1, complete: 2.2, study_guide: 3.0 };
const DEPTH_MULTIPLIER: Record<Depth, number> = { brief: 0.65, match: 1, thorough: 1.5 };

/** Vision tokens for one page image at the 2000px cap, plus its transcription back out. */
const OCR_TOKENS_IN = 1100;
const OCR_TOKENS_OUT = 700;

/** Roughly what the stream delivers, from the 04 §8 target of a first section inside 6 s. */
const TOKENS_PER_SECOND = 55;
const STARTUP_SECONDS = 5;

/**
 * Characters per token. CJK is close to one token per character; Latin scripts run near four.
 * Getting this wrong by 3x is the difference between "1 credit" and "4 credits" on the same notes.
 */
function charsPerToken(language: string): number {
  return /^(zh|ja|ko)/.test(language) ? 1.4 : 3.8;
}

export interface EstimateInput {
  charCount: number;
  ocrPages: number;
  language: string;
  options: EnhanceOptions;
}

export interface Estimate {
  credits: number;
  costCny: number;
  seconds: number;
  tokensIn: number;
  tokensOut: number;
}

export function estimateRun({ charCount, ocrPages, language, options }: EstimateInput): Estimate {
  const noteTokens = Math.ceil(charCount / charsPerToken(language));
  const tokensIn = noteTokens + ocrPages * OCR_TOKENS_IN;

  const wanted = Math.ceil(
    noteTokens * OUTPUT_RATIO[options.mode] * DEPTH_MULTIPLIER[options.depth],
  );
  const tokensOut = Math.min(MAX_OUTPUT_TOKENS[options.mode], wanted) + ocrPages * OCR_TOKENS_OUT;

  const costCny =
    (tokensIn * RATE_IN_MISS + tokensOut * RATE_OUT + FIXED_PROMPT_TOKENS * RATE_IN_HIT) /
    1_000_000;

  const credits = CREDIT_WEIGHTS[options.mode] + ocrPages * CREDIT_WEIGHTS.ocr_page;

  return {
    credits: Math.round(credits * 100) / 100,
    costCny: Math.round(costCny * 10_000) / 10_000,
    seconds: Math.round(STARTUP_SECONDS + tokensOut / TOKENS_PER_SECOND),
    tokensIn,
    tokensOut,
  };
}

/** "1 credit", "1.4 credits" — the student-facing unit (01-PRODUCT.md §4). */
export function formatCredits(credits: number): string {
  const rounded = Math.round(credits * 10) / 10;
  return `${rounded} ${rounded === 1 ? 'credit' : 'credits'}`;
}

/** "about 40 seconds", "about 2 minutes". Never a false precision like "1 m 47 s". */
export function formatDuration(seconds: number): string {
  if (seconds < 20) return 'about 15 seconds';
  if (seconds < 90) return `about ${Math.round(seconds / 10) * 10} seconds`;
  return `about ${Math.round(seconds / 30) / 2} minutes`;
}

export function formatCost(costCny: number): string {
  return costCny < 0.01 ? '<¥0.01' : `¥${costCny.toFixed(2)}`;
}
