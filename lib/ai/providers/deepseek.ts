/**
 * DeepSeek — the shared primary (02-ARCHITECTURE.md §2).
 *
 * OpenAI-compatible, so this is configuration rather than code. Two things are load-bearing:
 *
 *   Prefix caching is automatic and server-side. Nothing is sent to ask for it; it happens when
 *   the beginning of the prompt is byte-identical to a recent one, which is what the message order
 *   in `lib/ai/prompts/index.ts` exists to guarantee. The response reports the split as
 *   `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`, and the ledger prices them separately
 *   (a hit is ~31x cheaper, verified against the live price list on 2026-08-30).
 *
 *   `response_format: { type: 'json_object' }` is not full JSON-Schema, and DeepSeek requires the
 *   word "json" to appear in the prompt. Both are satisfied by the rubric and the schema block.
 */
import { createOpenAICompatibleProvider } from './openai-compatible';
import type { LLMProvider, ProviderConfig } from '../provider';

export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

export function createDeepSeekProvider(config: ProviderConfig): LLMProvider {
  return createOpenAICompatibleProvider({
    ...config,
    id: 'deepseek',
    baseUrl: config.baseUrl ?? DEEPSEEK_BASE_URL,
    includeUsage: true,
    jsonMode: true,
  });
}
