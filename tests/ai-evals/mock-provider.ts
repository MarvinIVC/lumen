/**
 * Mock LLM provider for the eval harness (04-AI-ENGINE.md §9).
 *
 * CI must never spend money or depend on a third party being up, so `pnpm test:ai` runs the whole
 * pipeline against recorded responses. The nightly job swaps this for the real DeepSeek provider
 * on a tiny fixture budget; both must satisfy the same hard checks.
 */
import type {
  ChatChunk,
  ChatRequest,
  LLMProvider,
  ProviderConfig,
  ProviderError,
} from '@/lib/ai/provider';

export interface MockScript {
  /** Emitted in order, as if streamed. Split a recorded response to exercise partial parsing. */
  chunks: string[];
  tokensIn?: number;
  tokensOut?: number;
  /** Emitted instead of `chunks`, to exercise the fallback and repair paths (§2 step 3, §8). */
  error?: ProviderError;
  /** Milliseconds between chunks. Keep at 0 unless a test is specifically about timing. */
  delayMs?: number;
}

export interface MockProvider extends LLMProvider {
  /** Every request the code under test made, in order. Assert on prompt assembly with this. */
  readonly calls: ChatRequest[];
}

const DEFAULTS: ProviderConfig = {
  id: 'deepseek',
  model: 'mock-flash',
  apiKey: 'mock',
  pricePerMTokIn: 1,
  pricePerMTokOut: 2,
};

/**
 * Returns a provider that replays `scripts` in order — one per call, the last one repeating.
 * That is enough to model a primary failure followed by a fallback success.
 */
export function createMockProvider(
  scripts: MockScript[],
  config: Partial<ProviderConfig> = {},
): MockProvider {
  const merged = { ...DEFAULTS, ...config };
  const calls: ChatRequest[] = [];
  let index = 0;

  async function* chat(req: ChatRequest): AsyncIterable<ChatChunk> {
    calls.push(req);
    const script = scripts[Math.min(index, scripts.length - 1)] ?? { chunks: [] };
    index += 1;

    if (script.error) {
      yield { type: 'error', error: script.error };
      yield { type: 'done', finishReason: 'error' };
      return;
    }

    for (const text of script.chunks) {
      if (req.signal.aborted) {
        yield { type: 'done', finishReason: 'abort' };
        return;
      }
      if (script.delayMs) await new Promise((r) => setTimeout(r, script.delayMs));
      yield { type: 'text', text };
    }

    const joined = script.chunks.join('');
    yield {
      type: 'usage',
      usage: {
        tokensIn: script.tokensIn ?? Math.ceil(req.system.length / 4),
        tokensOut: script.tokensOut ?? Math.ceil(joined.length / 4),
      },
    };
    yield { type: 'done', finishReason: 'stop' };
  }

  return {
    id: merged.id,
    model: merged.model,
    supportsVision: merged.supportsVision ?? false,
    pricePerMTokIn: merged.pricePerMTokIn,
    pricePerMTokOut: merged.pricePerMTokOut,
    chat,
    calls,
  };
}

/** Splits a recorded JSON response into stream-sized pieces, so partial parsing gets exercised. */
export function chunked(text: string, size = 64): string[] {
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += size) parts.push(text.slice(i, i + size));
  return parts;
}
