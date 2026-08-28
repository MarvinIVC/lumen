/**
 * Router (04-AI-ENGINE.md §2). Runs inside the Supabase edge function — never in the browser,
 * because it reads the shared provider keys and the quota ledger.
 *
 * Order of business, and it matters:
 *   1. BYOK present and valid → use it. Skip quota. Skip the global cap.
 *   2. Otherwise, in this order: kill switch → global daily cap → per-tier quota.
 *   3. Primary = deepseek-v4-flash. On timeout >90s / 5xx / rate-limit / invalid-after-repair,
 *      fall back to gemini-2.5-flash exactly once.
 *   4. On fallback failure → partial + resumable error, and do NOT charge a full credit.
 *   5. After completion → write usage_event, upsert daily_cost.
 *
 * Implementation is phase-04; these are the shapes the edge function will be built against.
 */
import type { LLMProvider, ProviderId } from './provider';
import type { EnhanceOptions, NoteContext } from './schema';

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

export interface AppConfig {
  enhance_enabled: boolean;
  daily_cap_cny: number;
  quota: Record<Tier, QuotaTier>;
  credit_weights: Record<string, number>;
  pricing: Record<string, { in: number; out: number }>;
  models: { primary: string; verify: string; vision: string; fallback: string };
  limits: {
    max_chars: number;
    max_pages: number;
    max_bytes: number;
    max_tokens: Record<string, number>;
    anon_lifetime_calls: number;
    ip_calls_per_hour: number;
  };
}

export type RefusalReason =
  'kill-switch' | 'community-limit' | 'quota' | 'not-study-notes' | 'too-large' | 'rate-limited';

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
}

export type RouteResult = RouteDecision | RouteRefusal;

export interface RouteInput {
  caller: Caller;
  kind: CallKind;
  config: AppConfig;
  context: NoteContext;
  options: EnhanceOptions;
}

/** Steps 1–2: picks a provider or refuses. Runs *before* any tokens are spent. */
export declare function route(input: RouteInput): Promise<RouteResult>;

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
}

/** Step 5: append to `usage_event` and upsert `daily_cost`. The cost ceiling depends on this. */
export declare function recordUsage(record: UsageRecord): Promise<void>;

/** Cost in CNY for a call, from `app_config.pricing`. Cached input is billed at ~1/50. */
export declare function estimateCost(
  model: string,
  tokensIn: number,
  tokensOut: number,
  cachedTokensIn: number,
  pricing: AppConfig['pricing'],
): number;
