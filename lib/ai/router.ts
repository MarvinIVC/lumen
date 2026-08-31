/**
 * Router (04-AI-ENGINE.md §2). Runs inside the Supabase edge function — never in the browser,
 * because it reads the shared provider keys and the quota ledger.
 *
 * Order of business, and it matters:
 *   1. BYOK present and valid → use it. Skip quota. Skip the global cap.
 *   2. Otherwise, in this order: kill switch → monthly ceiling → daily burst cap → per-tier
 *      quota. The monthly cap is the ceiling from 00-BRIEF.md §5.2; the daily one is a burst
 *      guard, so a runaway is caught in hours rather than at month end.
 *   3. Primary = deepseek-v4-flash. On timeout >90s / 5xx / rate-limit / invalid-after-repair,
 *      fall back to gemini-2.5-flash exactly once.
 *   4. On fallback failure → partial + resumable error, and do NOT charge a full credit.
 *   5. After completion → write usage_event, upsert daily_cost.
 *
 * The decision itself (`decide`) is a pure function of the config and one snapshot of the ledger,
 * so the whole state machine is testable without a database; `route` is the thin wrapper that
 * reads the snapshot and constructs the providers. The Postgres side is
 * `supabase/functions/_shared/guardrails.ts`.
 */
import { createDeepSeekProvider, createGeminiProvider, createProvider } from './providers/index.ts';
import type { LLMProvider, ProviderId } from './provider.ts';
import type { EnhanceOptions, NoteContext } from './schema.ts';

export type Tier = 'anon' | 'verified' | 'byok';
export type CallKind = 'enhance' | 'ocr' | 'regen' | 'detect' | 'verify';

export interface Caller {
  tier: Tier;
  /** Signed-in user. Null for anonymous callers. */
  userId: string | null;
  /** Signed, rotating cookie value — the quota key for signed-out users (02 §5). */
  anonId: string | null;
  byok?: { provider: ProviderId; baseUrl?: string; model: string; apiKey: string };
}

/** Mirrors `app_config` (02-ARCHITECTURE.md §7). Read fresh per call so it is editable live. */
export interface QuotaTier {
  enhance_per_day: number;
  regen_fraction?: number;
  ocr_per_day?: number;
}

/**
 * CNY per million tokens, seeded and kept current in `app_config.pricing`.
 *
 * DeepSeek bills peak and off-peak separately (off-peak is exactly half), and prices a cached
 * input token ~31x below a fresh one, so the ledger records the rate that actually applied
 * rather than deriving it. Verified 2026-08-28; see the migration for the source.
 */
export interface RateCard {
  in_miss: number;
  in_hit: number;
  out: number;
}

export interface ModelPricing {
  peak: RateCard;
  off_peak: RateCard;
}

export interface PricingMeta {
  currency: string;
  fx_usd_cny: number;
  verified_on: string;
  peak_hours_utc: string;
  source?: string;
  unit?: string;
}

/**
 * The `app_config.pricing` row: one entry per model, plus a `_meta` entry that documents where the
 * numbers came from and when they were last verified.
 *
 * Phase-00 typed this as `Record<string, ModelPricing> & { _meta?: … }`, which no object literal
 * can actually satisfy — the index signature demands `_meta` be a rate card. It is an index
 * signature over a union instead, and `rateCard` narrows: a row without a `peak` is not a model.
 */
export type PricingTable = {
  _meta?: PricingMeta;
} & Record<string, ModelPricing | PricingMeta | undefined>;

export interface AppConfig {
  enhance_enabled: boolean;
  /** The ceiling from 00-BRIEF.md §5.2, checked against this month's summed `daily_cost`. */
  monthly_cap_cny: number;
  /** Burst guard at ~2x the realistic daily average — catches a runaway within hours. */
  daily_cap_cny: number;
  quota: Record<Tier, QuotaTier>;
  credit_weights: Record<string, number>;
  pricing: PricingTable;
  models: { primary: string; verify: string; vision: string; fallback: string };
  limits: {
    max_chars: number;
    max_pages: number;
    max_bytes: number;
    max_tokens: Record<string, number>;
    anon_lifetime_calls: number;
    ip_calls_per_hour: number;
    /** Per provider call. Defaults to 90 s; the Supabase edge function's own ceiling is 150 s. */
    timeout_ms?: number;
  };
  /**
   * Reasoning effort per call kind, for models that reason before answering.
   *
   * Reasoning is billed as output and counted against `max_tokens`, so it is worth paying for
   * where judgement is the product — rebuilding a lesson, checking a calculation — and pure waste
   * where the work is mechanical. Classifying a note and transcribing a page are mechanical.
   */
  reasoning?: Partial<Record<CallKind, 'none' | 'low' | 'medium' | 'high'>>;
}

export type RefusalReason =
  | 'kill-switch'
  // Both caps read the same to the student ("we've hit today's community limit — bring your own
  // key, or try tomorrow"), but they stay distinct so the admin dashboard and the 60%/90% alerts
  // can tell a burst apart from a month that is genuinely running out.
  | 'monthly-cap'
  | 'daily-cap'
  | 'quota'
  | 'not-study-notes'
  | 'too-large'
  | 'rate-limited';

export interface RouteRefusal {
  ok: false;
  reason: RefusalReason;
  message: string;
  /** ISO timestamp at which the caller may try again, when that is knowable. */
  resetsAt?: string;
}

export interface RouteDecision {
  ok: true;
  provider: LLMProvider;
  fallback: LLMProvider | null;
  /** Credits this call will cost, from `credit_weights`. Charged only on success. */
  credits: number;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  reasoningEffort: 'none' | 'low' | 'medium' | 'high' | undefined;
}

export type RouteResult = RouteDecision | RouteRefusal;

export interface RouteInput {
  caller: Caller;
  kind: CallKind;
  config: AppConfig;
  context: NoteContext;
  options: EnhanceOptions;
}

/**
 * Everything the guardrails need to decide, read in one round trip.
 *
 * Six separate queries before every call would put the quota check on the critical path of the
 * one thing students wait for, so the edge function reads them together (see
 * `supabase/functions/_shared/guardrails.ts`) and the decision below is a pure function of the
 * result. That also makes the state machine testable without a database.
 */
export interface GuardrailSnapshot {
  /** Sum of `daily_cost` for the current UTC month, before this call. */
  monthCostCny: number;
  /** Today's `daily_cost`, before this call. */
  dayCostCny: number;
  /** Credits this caller has spent in the rolling 24 hours, split by what the quota governs. */
  creditsLast24h: { enhance: number; ocr: number };
  /** When the oldest of those events happened — the quota card's "resets at". */
  oldestEventLast24h: string | null;
  /** Lifetime shared-key calls for an anonymous caller, to blunt cookie farming (§7 layer 3). */
  anonLifetimeCalls: number;
  /** Calls from this IP in the last hour. */
  ipCallsLastHour: number;
}

export interface GuardrailStore {
  snapshot(caller: Caller, kind: CallKind): Promise<GuardrailSnapshot>;
}

/** Shared keys, read from function secrets. Never present in a client bundle. */
export interface ProviderKeys {
  deepseek?: string;
  gemini?: string;
  /**
   * Overrides `https://api.deepseek.com`. It exists for two reasons that are the same reason: the
   * integration test points it at a scripted server so the guardrails, the ledger and the SSE
   * contract can be exercised in CI without a paid call, and a deployment behind a proxy can point
   * it at the proxy. Unset in production.
   */
  deepseekBaseUrl?: string;
}

export interface RouteContext {
  store: GuardrailStore;
  keys: ProviderKeys;
  /** Injectable so the peak/off-peak branch and the reset times are testable. */
  now?: Date;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** What one call of this kind and mode costs the caller's allowance. */
export function creditsFor(input: Pick<RouteInput, 'kind' | 'options' | 'config'>): number {
  const weights = input.config.credit_weights;
  switch (input.kind) {
    case 'enhance':
      return weights[input.options.mode] ?? 1;
    case 'regen':
      return weights.regen ?? 0.25;
    case 'ocr':
      return weights.ocr_page ?? 0.15;
    // Detection and verification are part of the machinery rather than something a student asked
    // for, so they are logged for cost but never billed to an allowance.
    default:
      return 0;
  }
}

function refuse(reason: RefusalReason, message: string, resetsAt?: string): RouteRefusal {
  return resetsAt ? { ok: false, reason, message, resetsAt } : { ok: false, reason, message };
}

/**
 * The guardrail state machine (02-ARCHITECTURE.md §7), as a pure function.
 *
 * Order matters and is not the order the spec lists them in: BYOK first (it is not our money), then
 * the kill switch (an operator has said stop), then the two spend caps (the ceiling from the
 * brief, then the burst guard), then the per-caller quota, then abuse control. Anything that
 * refuses does so before a single token is spent.
 */
export function decide(
  input: RouteInput,
  snapshot: GuardrailSnapshot,
  now: Date = new Date(),
): RouteRefusal | { ok: true; tier: Tier; credits: number } {
  const credits = creditsFor(input);
  const tier: Tier = input.caller.byok ? 'byok' : input.caller.userId ? 'verified' : 'anon';

  if (input.caller.byok) {
    // BYOK skips both caps and the quota. It is still rate limited, because a leaked key of ours
    // is not the only thing an abusive client can do with an endpoint.
    if (snapshot.ipCallsLastHour >= input.config.limits.ip_calls_per_hour) {
      return refuse('rate-limited', 'Too many requests from this network. Try again shortly.');
    }
    return { ok: true, tier, credits };
  }

  if (!input.config.enhance_enabled) {
    return refuse(
      'kill-switch',
      'Rebuilding notes is paused right now. Your notes are safe on this device — try again a little later, or add your own API key to keep going.',
    );
  }

  if (snapshot.monthCostCny >= input.config.monthly_cap_cny) {
    return refuse('monthly-cap', COMMUNITY_LIMIT, firstOfNextMonth(now).toISOString());
  }
  if (snapshot.dayCostCny >= input.config.daily_cap_cny) {
    return refuse('daily-cap', COMMUNITY_LIMIT, nextUtcMidnight(now).toISOString());
  }

  const quota = input.config.quota[tier];
  const isOcr = input.kind === 'ocr';
  const allowance = isOcr ? (quota?.ocr_per_day ?? 0) : (quota?.enhance_per_day ?? 0);
  const used = isOcr ? snapshot.creditsLast24h.ocr : snapshot.creditsLast24h.enhance;

  if (used + credits > allowance) {
    const oldest = snapshot.oldestEventLast24h ? new Date(snapshot.oldestEventLast24h) : now;
    return refuse(
      'quota',
      isOcr
        ? "That's all the free page reading for today."
        : "That's all the free study guides for today.",
      new Date(oldest.getTime() + DAY_MS).toISOString(),
    );
  }

  if (tier === 'anon' && snapshot.anonLifetimeCalls >= input.config.limits.anon_lifetime_calls) {
    return refuse(
      'quota',
      'You have used all the free study guides this browser gets. Signing in gives you more, and your own API key removes the limit.',
    );
  }

  if (snapshot.ipCallsLastHour >= input.config.limits.ip_calls_per_hour) {
    return refuse('rate-limited', 'Too many requests from this network. Try again shortly.');
  }

  return { ok: true, tier, credits };
}

const COMMUNITY_LIMIT =
  "We've hit today's community limit — Lumen is free and the shared budget runs out sometimes. Add your own API key to keep going now, or come back tomorrow.";

function nextUtcMidnight(now: Date): Date {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next;
}

function firstOfNextMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** Steps 1–2: picks a provider or refuses. Runs *before* any tokens are spent. */
export async function route(input: RouteInput, context: RouteContext): Promise<RouteResult> {
  const now = context.now ?? new Date();
  const snapshot = await context.store.snapshot(input.caller, input.kind);
  const decision = decide(input, snapshot, now);
  if (!decision.ok) return decision;

  const maxTokens = maxTokensFor(input);
  const temperature = TEMPERATURES[input.kind];
  const timeoutMs = input.config.limits.timeout_ms ?? DEFAULT_TIMEOUT_MS;
  const reasoningEffort = input.config.reasoning?.[input.kind];

  if (input.caller.byok) {
    const byok = input.caller.byok;
    // A BYOK DeepSeek key goes to whatever this deployment calls DeepSeek, which is the live API
    // everywhere except an integration test. An explicit base URL from the student always wins.
    const baseUrl =
      byok.baseUrl ?? (byok.provider === 'deepseek' ? context.keys.deepseekBaseUrl : undefined);
    return {
      ok: true,
      provider: createProvider({
        id: byok.provider,
        model: byok.model,
        apiKey: byok.apiKey,
        ...(baseUrl ? { baseUrl } : {}),
        // A student's own key is billed by their provider, not by us, so it carries no rate card.
        // `estimateCost` returns 0 for an unpriced model and `daily_cost` stays our spend only.
        pricePerMTokIn: 0,
        pricePerMTokOut: 0,
        supportsVision: true,
      }),
      fallback: null,
      credits: decision.credits,
      maxTokens,
      temperature,
      timeoutMs,
      reasoningEffort,
    };
  }

  const models = input.config.models;
  const model =
    input.kind === 'ocr'
      ? models.vision
      : input.kind === 'verify' && input.options.depth === 'thorough'
        ? models.verify
        : models.primary;

  if (!context.keys.deepseek) {
    return refuse('kill-switch', 'Rebuilding notes is not configured on this server.');
  }

  const rates = rateCard(model, input.config.pricing, now);
  const provider = createDeepSeekProvider({
    id: 'deepseek',
    model,
    apiKey: context.keys.deepseek,
    ...(context.keys.deepseekBaseUrl ? { baseUrl: context.keys.deepseekBaseUrl } : {}),
    pricePerMTokIn: rates.in_miss,
    pricePerMTokOut: rates.out,
    supportsVision: model === models.vision,
  });

  const fallbackRates = rateCard(models.fallback, input.config.pricing, now);
  const fallback = context.keys.gemini
    ? createGeminiProvider({
        id: 'gemini',
        model: models.fallback,
        apiKey: context.keys.gemini,
        pricePerMTokIn: fallbackRates.in_miss,
        pricePerMTokOut: fallbackRates.out,
        supportsVision: true,
      })
    : null;

  return {
    ok: true,
    provider,
    fallback,
    credits: decision.credits,
    maxTokens,
    temperature,
    timeoutMs,
    reasoningEffort,
  };
}

/** 04-AI-ENGINE.md §2 step 3. Overridable because a reasoning model can run past it legitimately. */
const DEFAULT_TIMEOUT_MS = 90_000;

/**
 * The examiner for the verify pass (§6).
 *
 * Not a second `route()` call: the guardrails have already run for this generation and the verify
 * pass is part of it, not a new thing to charge for. "Thorough" depth is what upgrades the model
 * from flash to pro — the only place the dearer one is used.
 */
export function createVerifier(
  config: AppConfig,
  keys: ProviderKeys,
  options: EnhanceOptions,
  now: Date = new Date(),
): LLMProvider | null {
  if (!keys.deepseek) return null;
  const model = options.depth === 'thorough' ? config.models.verify : config.models.primary;
  const rates = rateCard(model, config.pricing, now);
  return createDeepSeekProvider({
    id: 'deepseek',
    model,
    apiKey: keys.deepseek,
    ...(keys.deepseekBaseUrl ? { baseUrl: keys.deepseekBaseUrl } : {}),
    pricePerMTokIn: rates.in_miss,
    pricePerMTokOut: rates.out,
  });
}

/** §2: 0.3 for enhance, 0.0 for detect and verify. */
const TEMPERATURES: Record<CallKind, number> = {
  enhance: 0.3,
  regen: 0.3,
  ocr: 0,
  detect: 0,
  verify: 0,
};

export function maxTokensFor(input: Pick<RouteInput, 'kind' | 'options' | 'config'>): number {
  const caps = input.config.limits.max_tokens;
  if (input.kind === 'enhance' || input.kind === 'regen') return caps[input.options.mode] ?? 8000;
  return caps[input.kind] ?? 4000;
}

/** True during DeepSeek's peak window (01:00-04:00 and 06:00-10:00 UTC, Mon-Fri). */
export function isPeak(at: Date, pricing: PricingTable): boolean {
  const spec = pricing._meta?.peak_hours_utc ?? DEFAULT_PEAK_HOURS;
  const weekdayOnly = /mon\s*-\s*fri/i.test(spec);
  const day = at.getUTCDay();
  if (weekdayOnly && (day === 0 || day === 6)) return false;

  const minutes = at.getUTCHours() * 60 + at.getUTCMinutes();
  const windows = [...spec.matchAll(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g)];
  const ranges =
    windows.length > 0
      ? windows
      : [...DEFAULT_PEAK_HOURS.matchAll(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g)];

  return ranges.some((match) => {
    const from = Number(match[1]) * 60 + Number(match[2]);
    const to = Number(match[3]) * 60 + Number(match[4]);
    return minutes >= from && minutes < to;
  });
}

/**
 * The windows as verified on 2026-08-30, used only if `app_config.pricing._meta.peak_hours_utc`
 * has been edited into something unparseable. Config stays authoritative; this stops a typo in a
 * production row from silently pricing everything off-peak.
 */
const DEFAULT_PEAK_HOURS = '01:00-04:00 and 06:00-10:00, Mon-Fri';

const ZERO_RATES: RateCard = { in_miss: 0, in_hit: 0, out: 0 };

export function rateCard(model: string, pricing: PricingTable, at: Date = new Date()): RateCard {
  const card = pricing[model];
  if (!card || !('peak' in card)) return ZERO_RATES;
  return isPeak(at, pricing) ? card.peak : card.off_peak;
}

/**
 * Cost in CNY for one call. `cachedTokensIn` is billed at the far cheaper `in_hit` rate and is
 * subtracted from `tokensIn`, so pass the provider's reported totals unmodified.
 *
 * At verified rates output is ~86% of the cost of a typical enhancement, which is why
 * `limits.max_tokens` per mode does more for the ceiling than prompt caching does.
 *
 * An unknown model prices at zero, which is exactly right for BYOK: a student's own key is not our
 * spend and must not count against the community cap.
 */
export function estimateCost(
  model: string,
  tokensIn: number,
  tokensOut: number,
  cachedTokensIn: number,
  pricing: PricingTable,
  at: Date = new Date(),
): number {
  const card = rateCard(model, pricing, at);
  const cached = Math.min(Math.max(0, cachedTokensIn), Math.max(0, tokensIn));
  const missed = Math.max(0, tokensIn - cached);
  const cost =
    (missed * card.in_miss + cached * card.in_hit + Math.max(0, tokensOut) * card.out) / 1_000_000;
  // Five decimals is what `usage_event.cost_cny` stores; rounding here keeps the ledger and the
  // running total in agreement instead of drifting by fractions of a fen.
  return Math.round(cost * 100_000) / 100_000;
}

export interface UsageRecord {
  ownerId: string | null;
  anonId: string | null;
  kind: CallKind;
  provider: ProviderId;
  model: string;
  tokensIn: number;
  tokensOut: number;
  cachedTokensIn: number;
  costCny: number;
  credits: number;
  byok: boolean;
  /** Hashed, never the address itself — it is the per-hour rate limit's key (§7 layer 3). */
  ipHash?: string | null;
}

export interface UsageStore {
  append(record: UsageRecord): Promise<void>;
}

/** Step 5: append to `usage_event` and upsert `daily_cost`. The cost ceiling depends on this. */
export async function recordUsage(record: UsageRecord, store: UsageStore): Promise<void> {
  await store.append(record);
}
