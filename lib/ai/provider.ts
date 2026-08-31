/**
 * Provider abstraction (04-AI-ENGINE.md §2).
 *
 * One internal interface so models can be swapped without touching product code. Every provider
 * streams; a non-streaming call is just a stream you drain. Implementations land in phase-04 and
 * run inside the Supabase edge function, never in the browser.
 */

export type ProviderId = 'deepseek' | 'gemini' | 'openai-compatible' | 'anthropic';

export interface TextPart {
  type: 'text';
  text: string;
}

export interface ImagePart {
  type: 'image';
  /** data: URL or a short-lived https URL. Never a Supabase Storage path with a service key. */
  url: string;
  mimeType: string;
}

export type MultimodalPart = TextPart | ImagePart;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | MultimodalPart[];
}

export interface ChatRequest {
  system: string;
  /** Provider hint: content that should be prompt-cached. Must be stable and come first. */
  cachePrefix?: string;
  messages: ChatMessage[];
  /** Ask for `response_format: json_object` (or the provider's equivalent). */
  json: boolean;
  maxTokens: number;
  temperature: number;
  /**
   * How long to wait for the whole response, in ms. Defaults to 90 s, which is what
   * 04-AI-ENGINE.md §2 step 3 names as the point at which the fallback provider gets a turn.
   *
   * It is a per-call number rather than a constant because that 90 s was written before the
   * primary model reasoned: a full study guide with reasoning on runs past it, and a request that
   * always times out is a fallback that always fires. The ceiling is the Supabase edge function's
   * own 150 s (02-ARCHITECTURE.md §2).
   */
  timeoutMs?: number;
  /**
   * DeepSeek's V4 models reason before answering, and the reasoning is billed as output and
   * counted against `maxTokens`. `'none'` turns it off, which is right for mechanical work —
   * classifying a note, transcribing a page — and wrong for the enhancement itself.
   */
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
  signal: AbortSignal;
}

export interface ChatUsage {
  tokensIn: number;
  tokensOut: number;
  /** Input tokens served from the provider's prefix cache, when it reports them. */
  cachedTokensIn?: number;
}

export type ChatChunk =
  | { type: 'text'; text: string }
  | { type: 'usage'; usage: ChatUsage }
  | { type: 'done'; finishReason: 'stop' | 'length' | 'content-filter' | 'abort' | 'error' }
  | { type: 'error'; error: ProviderError };

export type ProviderErrorKind =
  'auth' | 'rate-limit' | 'timeout' | 'server' | 'bad-request' | 'content-filter' | 'network';

export interface ProviderError {
  kind: ProviderErrorKind;
  message: string;
  status?: number;
  /** Whether the router should try the fallback provider (04-AI-ENGINE.md §2, step 3). */
  retryable: boolean;
}

export interface LLMProvider {
  id: ProviderId;
  model: string;
  supportsVision: boolean;
  /**
   * CNY per million tokens, resolved from `app_config.pricing` when the provider is constructed:
   * the peak or off-peak card for the current time, cache-miss rate for input. The ledger
   * recomputes exact cost from the provider's reported cached/uncached split.
   */
  pricePerMTokIn: number;
  pricePerMTokOut: number;
  chat(req: ChatRequest): AsyncIterable<ChatChunk>;
}

/** What the edge function needs to construct a provider. BYOK values arrive already decrypted. */
export interface ProviderConfig {
  id: ProviderId;
  model: string;
  apiKey: string;
  baseUrl?: string;
  pricePerMTokIn: number;
  pricePerMTokOut: number;
  supportsVision?: boolean;
}

/* -------------------------------------------------------------------------- *
 * Implementations
 *
 * They live in `lib/ai/providers/`, not here. This module is imported for its types by code that
 * ends up in the browser bundle; a value export would drag four provider implementations — and
 * the exact shape of our requests to paid APIs — along with it.
 *
 *   createDeepSeekProvider           providers/deepseek.ts
 *   createGeminiProvider             providers/gemini.ts
 *   createOpenAICompatibleProvider   providers/openai-compatible.ts   (BYOK)
 *   createAnthropicProvider          providers/anthropic.ts           (BYOK)
 *   createProvider                   providers/index.ts
 * -------------------------------------------------------------------------- */
