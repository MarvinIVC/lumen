/**
 * Provider construction (04-AI-ENGINE.md §2).
 *
 * Kept out of `lib/ai/provider.ts`, which is types only: that module is imported by client code for
 * its types, and a value export there would put provider code — and the shape of our requests to
 * paid APIs — into the browser bundle. `tests/unit/no-client-secrets.test.ts` checks the built
 * bundle for the secret names; this separation is what keeps that check passing by construction.
 */
import { createAnthropicProvider } from './anthropic';
import { createDeepSeekProvider } from './deepseek';
import { createGeminiProvider } from './gemini';
import { createOpenAICompatibleProvider } from './openai-compatible';
import type { LLMProvider, ProviderConfig } from '../provider';

export {
  createAnthropicProvider,
  createDeepSeekProvider,
  createGeminiProvider,
  createOpenAICompatibleProvider,
};
export { TIMEOUT_MS } from './openai-compatible';
export { readSse, sseFrame } from './sse';
export type { SseFrame } from './sse';

export function createProvider(config: ProviderConfig): LLMProvider {
  switch (config.id) {
    case 'deepseek':
      return createDeepSeekProvider(config);
    case 'gemini':
      return createGeminiProvider(config);
    case 'anthropic':
      return createAnthropicProvider(config);
    case 'openai-compatible':
      return createOpenAICompatibleProvider(config);
    default: {
      // The id is a closed union, so this is only reachable from untrusted input — a BYOK record
      // written by an older build, say. Failing loudly beats guessing which API someone meant.
      const unknown: never = config.id;
      throw new Error(`Unknown provider: ${String(unknown)}`);
    }
  }
}
