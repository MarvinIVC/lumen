/**
 * The Postgres half of the router's guardrails (02-ARCHITECTURE.md §7).
 *
 * One call to `guardrail_snapshot()` (see `0001_ai_engine.sql`), because this runs before every
 * shared-key call and is therefore on the critical path of the only thing students wait for. The
 * decision itself is `decide()` in `lib/ai/router.ts` — a pure function, tested without a database.
 */
import { rpc } from './db.ts';
import type {
  Caller,
  CallKind,
  GuardrailSnapshot,
  GuardrailStore,
} from '../../../lib/ai/router.ts';

interface SnapshotRow {
  monthCostCny: number | string;
  dayCostCny: number | string;
  creditsLast24h: { enhance: number | string; ocr: number | string };
  oldestEventLast24h: string | null;
  anonLifetimeCalls: number | string;
  ipCallsLastHour: number | string;
}

const num = (value: number | string | null | undefined): number => Number(value ?? 0);

export function createGuardrailStore(ipHash: string | null): GuardrailStore {
  return {
    async snapshot(caller: Caller, _kind: CallKind): Promise<GuardrailSnapshot> {
      const row = await rpc<SnapshotRow>('guardrail_snapshot', {
        p_owner: caller.userId,
        p_anon: caller.anonId,
        p_ip: ipHash,
      });

      return {
        // Postgres numerics arrive as strings over PostgREST; comparing one to a cap with `>=`
        // silently does a string comparison, and "10" >= 6 is false. Coerce every one of them.
        monthCostCny: num(row?.monthCostCny),
        dayCostCny: num(row?.dayCostCny),
        creditsLast24h: {
          enhance: num(row?.creditsLast24h?.enhance),
          ocr: num(row?.creditsLast24h?.ocr),
        },
        oldestEventLast24h: row?.oldestEventLast24h ?? null,
        anonLifetimeCalls: num(row?.anonLifetimeCalls),
        ipCallsLastHour: num(row?.ipCallsLastHour),
      };
    },
  };
}
