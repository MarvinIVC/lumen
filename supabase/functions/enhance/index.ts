/**
 * enhance — the heart of the product: quota check, prompt assembly, LLM call, streaming SSE, repair, usage ledger (04-AI-ENGINE.md).
 *
 * Stub: returns 501 until phase-04 implements it.
 */
import { notImplemented, serve } from '../_shared/response.ts';

const TODO =
  'Route (BYOK -> kill switch -> daily cap -> per-tier quota), build the cached prompt prefix, stream the provider through as SSE, run the verify pass for STEM families, then write usage_event and upsert daily_cost.';

serve((request) => notImplemented(request, 'enhance', TODO, 'phase-04'));
