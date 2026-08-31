/**
 * The OpenAI-compatible chat-completions core.
 *
 * DeepSeek is OpenAI-compatible and so is almost every endpoint a student will bring their own key
 * for — OpenRouter, Groq, Together, Moonshot, Zhipu, a local LM Studio tunnel — so this one
 * implementation covers three of the four providers. `fetch` only: the same file runs in Node under
 * vitest, in Deno inside the edge function, and never in the browser.
 */
import { errorFromException, errorFromStatus } from './errors.ts';
import { readSse } from './sse.ts';
import type {
  ChatChunk,
  ChatRequest,
  ChatUsage,
  LLMProvider,
  MultimodalPart,
  ProviderConfig,
} from '../provider.ts';

/** 04 §2 step 3: a call that has not answered in 90 s is a failure the fallback should get. */
export const TIMEOUT_MS = 90_000;

export interface OpenAICompatibleOptions extends ProviderConfig {
  /**
   * `stream_options: { include_usage: true }` is how an OpenAI-compatible endpoint is asked to put
   * a usage record in the final frame. DeepSeek honours it; some BYOK endpoints reject unknown
   * fields outright, so it is off by default and turned on for the providers we know.
   */
  includeUsage?: boolean;
  /** Off for endpoints that do not implement `response_format`; the prompt still asks for json. */
  jsonMode?: boolean;
  headers?: Record<string, string>;
}

interface StreamChoice {
  delta?: { content?: string | null };
  finish_reason?: string | null;
}

interface StreamEnvelope {
  choices?: StreamChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    // DeepSeek reports the cache split; the ledger prices the two halves differently.
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
}

function content(part: string | MultimodalPart[]): unknown {
  if (typeof part === 'string') return part;
  return part.map((piece) =>
    piece.type === 'text'
      ? { type: 'text', text: piece.text }
      : { type: 'image_url', image_url: { url: piece.url } },
  );
}

export function createOpenAICompatibleProvider(options: OpenAICompatibleOptions): LLMProvider {
  const baseUrl = (options.baseUrl ?? 'https://api.openai.com').replace(/\/+$/, '');

  async function* chat(req: ChatRequest): AsyncIterable<ChatChunk> {
    const timeout = AbortSignal.timeout(req.timeoutMs ?? TIMEOUT_MS);
    const signal = AbortSignal.any([req.signal, timeout]);

    const body: Record<string, unknown> = {
      model: options.model,
      stream: true,
      temperature: req.temperature,
      max_tokens: req.maxTokens,
      messages: [
        { role: 'system', content: req.system },
        ...req.messages.map((message) => ({
          role: message.role,
          content: content(message.content),
        })),
      ],
    };
    if (req.json && options.jsonMode !== false) body.response_format = { type: 'json_object' };
    if (options.includeUsage) body.stream_options = { include_usage: true };
    // Only sent when asked for. A BYOK endpoint that has never heard of it would reject the whole
    // request, and the default — whatever the model does on its own — is the right default.
    if (req.reasoningEffort) body.reasoning_effort = req.reasoningEffort;

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${options.apiKey}`,
          ...options.headers,
        },
        body: JSON.stringify(body),
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

    let usage: ChatUsage | null = null;
    let finish: ChatChunk & { type: 'done' } = { type: 'done', finishReason: 'stop' };

    try {
      for await (const frame of readSse(response.body, signal)) {
        if (frame.data === '[DONE]') break;
        let envelope: StreamEnvelope;
        try {
          envelope = JSON.parse(frame.data) as StreamEnvelope;
        } catch {
          continue;
        }

        const choice = envelope.choices?.[0];
        const text = choice?.delta?.content;
        if (text) yield { type: 'text', text };

        if (choice?.finish_reason === 'length') finish = { type: 'done', finishReason: 'length' };
        else if (choice?.finish_reason === 'content_filter') {
          finish = { type: 'done', finishReason: 'content-filter' };
        }

        if (envelope.usage) {
          const hit =
            envelope.usage.prompt_cache_hit_tokens ??
            envelope.usage.prompt_tokens_details?.cached_tokens ??
            0;
          usage = {
            tokensIn: envelope.usage.prompt_tokens ?? 0,
            tokensOut: envelope.usage.completion_tokens ?? 0,
            cachedTokensIn: hit,
          };
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

    if (req.signal.aborted) {
      // A cancelled generation still spent whatever it spent; report it so the ledger is honest,
      // then say plainly that it was aborted. `credits` is the thing that must not be charged.
      if (usage) yield { type: 'usage', usage };
      yield { type: 'done', finishReason: 'abort' };
      return;
    }

    if (usage) yield { type: 'usage', usage };
    yield finish;
  }

  return {
    id: options.id,
    model: options.model,
    supportsVision: options.supportsVision ?? false,
    pricePerMTokIn: options.pricePerMTokIn,
    pricePerMTokOut: options.pricePerMTokOut,
    chat,
  };
}
