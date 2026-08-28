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
 * Implementations — phase-04. Signatures only.
 * -------------------------------------------------------------------------- */

/** OpenAI-compatible, baseURL https://api.deepseek.com. Prefix caching is automatic server-side. */
export declare function createDeepSeekProvider(config: ProviderConfig): LLMProvider;

/** Native Gemini API. Uses responseMimeType + responseSchema for JSON. */
export declare function createGeminiProvider(config: ProviderConfig): LLMProvider;

/** BYOK: OpenRouter, Groq, Together, Moonshot, Zhipu, DeepSeek-personal, LM Studio tunnels… */
export declare function createOpenAICompatibleProvider(config: ProviderConfig): LLMProvider;

/** BYOK native Anthropic. JSON is mapped via tool-use or an assistant prefill. */
export declare function createAnthropicProvider(config: ProviderConfig): LLMProvider;

export declare function createProvider(config: ProviderConfig): LLMProvider;
