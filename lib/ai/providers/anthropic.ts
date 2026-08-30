/**
 * Anthropic — BYOK only (02-ARCHITECTURE.md §2). Some students already have a Claude key.
 *
 * Two mappings are specific to this API:
 *
 *   JSON. There is no `response_format`, so the request ends with an assistant turn prefilled with
 *   `{`. The model continues from there, which means its text is missing that first brace — the
 *   provider emits it as the first chunk so everything downstream sees ordinary JSON.
 *
 *   Caching. It is explicit rather than automatic: a `cache_control` breakpoint marks the end of
 *   the stable prefix. That is the same boundary the prompt builder draws (§4.1), so the two
 *   agree by construction rather than by coincidence.
 */
import { errorFromException, errorFromStatus } from './errors';
import { readSse } from './sse';
import { TIMEOUT_MS } from './openai-compatible';
import type {
  ChatChunk,
  ChatMessage,
  ChatRequest,
  ChatUsage,
  LLMProvider,
  ProviderConfig,
} from '../provider';

export const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';

interface AnthropicBlock {
  type: 'text' | 'image';
  text?: string;
  source?: { type: 'base64'; media_type: string; data: string };
  cache_control?: { type: 'ephemeral' };
}

interface AnthropicEvent {
  type?: string;
  delta?: { text?: string; stop_reason?: string; usage?: { output_tokens?: number } };
  message?: {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
    stop_reason?: string;
  };
  usage?: { output_tokens?: number };
}

function toBlocks(content: ChatMessage['content']): AnthropicBlock[] {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return content.map((piece) => {
    if (piece.type === 'text') return { type: 'text' as const, text: piece.text };
    const match = /^data:([^;]+);base64,(.*)$/s.exec(piece.url);
    if (!match?.[2]) throw new Error('Anthropic needs inline image data, not a URL');
    return {
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: match[1] ?? piece.mimeType, data: match[2] },
    };
  });
}

/** The Messages API wants alternating roles; our three user messages become one turn. */
function toMessages(messages: ChatMessage[], cacheAfterIndex: number) {
  const out: { role: 'user' | 'assistant'; content: AnthropicBlock[] }[] = [];
  messages.forEach((message, index) => {
    const blocks = toBlocks(message.content);
    // The breakpoint goes on the last stable block, so everything before it is cached.
    if (index === cacheAfterIndex && blocks.length > 0) {
      const last = blocks[blocks.length - 1];
      if (last) last.cache_control = { type: 'ephemeral' };
    }
    const previous = out[out.length - 1];
    if (previous && previous.role === message.role) previous.content.push(...blocks);
    else out.push({ role: message.role, content: blocks });
  });
  return out;
}

export function createAnthropicProvider(config: ProviderConfig): LLMProvider {
  const baseUrl = (config.baseUrl ?? ANTHROPIC_BASE_URL).replace(/\/+$/, '');

  async function* chat(req: ChatRequest): AsyncIterable<ChatChunk> {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const signal = AbortSignal.any([req.signal, timeout]);

    // Everything except the final run instruction is stable — see §4.1.
    const cacheAfterIndex = Math.max(0, req.messages.length - 2);
    const messages: { role: string; content: unknown }[] = toMessages(
      req.messages,
      cacheAfterIndex,
    );
    if (req.json) messages.push({ role: 'assistant', content: [{ type: 'text', text: '{' }] });

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: req.maxTokens,
          temperature: req.temperature,
          stream: true,
          system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
          messages,
        }),
        signal,
      });
    } catch (cause) {
      yield { type: 'error', error: errorFromException(cause, timeout.aborted) };
      yield { type: 'done', finishReason: req.signal.aborted ? 'abort' : 'error' };
      return;
    }

    if (!response.ok || !response.body) {
      const text = response.body ? await response.text() : '';
      yield { type: 'error', error: errorFromStatus(response.status, text) };
      yield { type: 'done', finishReason: 'error' };
      return;
    }

    // The prefill is part of the answer, and the caller must see valid JSON from byte one.
    if (req.json) yield { type: 'text', text: '{' };

    let tokensIn = 0;
    let cachedTokensIn = 0;
    let tokensOut = 0;
    let finish: ChatChunk & { type: 'done' } = { type: 'done', finishReason: 'stop' };

    try {
      for await (const frame of readSse(response.body, signal)) {
        let event: AnthropicEvent;
        try {
          event = JSON.parse(frame.data) as AnthropicEvent;
        } catch {
          continue;
        }

        if (event.type === 'content_block_delta' && event.delta?.text) {
          yield { type: 'text', text: event.delta.text };
        } else if (event.type === 'message_start' && event.message?.usage) {
          tokensIn = event.message.usage.input_tokens ?? 0;
          cachedTokensIn = event.message.usage.cache_read_input_tokens ?? 0;
        } else if (event.type === 'message_delta') {
          tokensOut = event.usage?.output_tokens ?? event.delta?.usage?.output_tokens ?? tokensOut;
          if (event.delta?.stop_reason === 'max_tokens')
            finish = { type: 'done', finishReason: 'length' };
        } else if (event.type === 'error') {
          yield {
            type: 'error',
            error: { kind: 'server', message: frame.data.slice(0, 200), retryable: true },
          };
          yield { type: 'done', finishReason: 'error' };
          return;
        }
      }
    } catch (cause) {
      if (req.signal.aborted) {
        yield { type: 'done', finishReason: 'abort' };
        return;
      }
      yield { type: 'error', error: errorFromException(cause, timeout.aborted) };
      yield { type: 'done', finishReason: 'error' };
      return;
    }

    const usage: ChatUsage = { tokensIn, tokensOut, cachedTokensIn };
    yield { type: 'usage', usage };
    yield req.signal.aborted ? { type: 'done', finishReason: 'abort' } : finish;
  }

  return {
    id: 'anthropic',
    model: config.model,
    supportsVision: config.supportsVision ?? true,
    pricePerMTokIn: config.pricePerMTokIn,
    pricePerMTokOut: config.pricePerMTokOut,
    chat,
  };
}
