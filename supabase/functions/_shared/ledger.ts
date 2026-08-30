/**
 * Writing the cost ledger (02-ARCHITECTURE.md §7, "Cost observability").
 *
 * The global cap is only as good as this write, so it goes through `record_usage()`, which appends
 * the event and moves `daily_cost` in one transaction. And it is written for *every* call that
 * spent tokens, including the ones that failed — a refusal, an abort or a provider error still
 * cost real money, and a ledger that only records successes would understate the day.
 *
 * What those calls do not do is charge a credit. `credits: 0` with a real `cost_cny` is the shape
 * of "we paid for this, the student does not".
 */
import { rpc } from './db.ts';
import { estimateCost } from '../../../lib/ai/router.ts';
import type { CallKind, PricingTable, UsageRecord } from '../../../lib/ai/router.ts';
import type { RunUsage } from '../../../lib/ai/enhance.ts';

export interface LedgerInput {
  caller: { userId: string | null; anonId: string | null };
  kind: CallKind;
  usage: RunUsage;
  credits: number;
  pricing: PricingTable;
  ipHash: string | null;
  byok: boolean;
  at?: Date;
}

/** Sums the per-model cost of a run — a verify pass may have used a different, dearer model. */
export function costOf(usage: RunUsage, pricing: PricingTable, at = new Date()): number {
  let total = 0;
  for (const [model, tokens] of Object.entries(usage.byModel)) {
    total += estimateCost(
      model,
      tokens.tokensIn,
      tokens.tokensOut,
      tokens.cachedTokensIn,
      pricing,
      at,
    );
  }
  return Math.round(total * 100_000) / 100_000;
}

export async function writeUsage(input: LedgerInput): Promise<UsageRecord> {
  const at = input.at ?? new Date();
  // A student's own key is their spend; we log the tokens for the dashboard but price it at zero
  // so it cannot move the community cap.
  const costCny = input.byok ? 0 : costOf(input.usage, input.pricing, at);

  const record: UsageRecord = {
    ownerId: input.caller.userId,
    anonId: input.caller.anonId,
    kind: input.kind,
    provider: input.usage.provider,
    model: input.usage.model,
    tokensIn: input.usage.tokensIn,
    tokensOut: input.usage.tokensOut,
    cachedTokensIn: input.usage.cachedTokensIn,
    costCny,
    credits: input.usage.charged ? input.credits : 0,
    byok: input.byok,
    ipHash: input.ipHash,
  };

  await rpc('record_usage', {
    p_owner: record.ownerId,
    p_anon: record.anonId,
    p_kind: record.kind,
    p_provider: record.provider,
    p_model: record.model,
    p_tokens_in: record.tokensIn,
    p_tokens_out: record.tokensOut,
    p_cached_tokens_in: record.cachedTokensIn,
    p_cost: record.costCny,
    p_credits: record.credits,
    p_byok: record.byok,
    p_ip: record.ipHash ?? null,
  });

  return record;
}
