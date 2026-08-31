/**
 * Google Gemini — the shared fallback and the free "Google may train on it" path (02 §2).
 *
 * Native API rather than the OpenAI-compatible shim, because the two things we need from it are
 * native: `responseMimeType: application/json` (and `responseSchema` where the shape is flat
 * enough to express), and inline image parts for the OCR path.
 *
 * On `responseSchema`: it is used for detection, whose output is a flat object it describes
 * exactly. It is deliberately NOT used for enhancement. The NoteDocument's blocks are a
 * discriminated union twelve members wide, and Gemini's schema subset cannot express that without
 * flattening every block into one optional-everything object — which would license exactly the
 * shapeless output the validator exists to reject. The rubric plus the schema block do that job
 * better here.
 */
import { errorFromException, errorFromStatus } from './errors.ts';
import { readSse } from './sse.ts';
import { TIMEOUT_MS } from './openai-compatible.ts';
import type {
  ChatChunk,
  ChatMessage,
  ChatRequest,
  ChatUsage,
  LLMProvider,
  ProviderConfig,
} from '../provider.ts';

export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';

export interface GeminiOptions extends ProviderConfig {
  /** A JSON-Schema subset Gemini understands. Only pass it for flat, non-union output. */
  responseSchema?: Record<string, unknown>;
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface GeminiEnvelope {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    cachedContentTokenCount?: number;
  };
  error?: { message?: string };
}

function toParts(content: ChatMessage['content']): GeminiPart[] {
  if (typeof content === 'string') return [{ text: content }];
  return content.map((piece) =>
    piece.type === 'text'
      ? { text: piece.text }
      : { inlineData: { mimeType: piece.mimeType, data: stripDataUrl(piece.url) } },
  );
}

/** Gemini takes raw base64, not a data: URL. A https URL cannot be inlined and is refused. */
function stripDataUrl(url: string): string {
  const match = /^data:[^;]+;base64,(.*)$/s.exec(url);
  if (!match?.[1]) throw new Error('Gemini needs inline image data, not a URL');
  return match[1];
}

/**
 * Gemini alternates `user` and `model` turns strictly, and our prompt is three consecutive user
 * messages by design (§4.1). Merging them into one turn with three parts keeps the byte order —
 * and therefore the cacheable prefix — exactly as assembled.
 */
function toContents(messages: ChatMessage[]): { role: string; parts: GeminiPart[] }[] {
  const contents: { role: string; parts: GeminiPart[] }[] = [];
  for (const message of messages) {
    const role = message.role === 'assistant' ? 'model' : 'user';
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts.push(...toParts(message.content));
    else contents.push({ role, parts: toParts(message.content) });
  }
  return contents;
}

export function createGeminiProvider(options: GeminiOptions): LLMProvider {
  const baseUrl = (options.baseUrl ?? GEMINI_BASE_URL).replace(/\/+$/, '');

  async function* chat(req: ChatRequest): AsyncIterable<ChatChunk> {
    const timeout = AbortSignal.timeout(req.timeoutMs ?? TIMEOUT_MS);
    const signal = AbortSignal.any([req.signal, timeout]);

    const generationConfig: Record<string, unknown> = {
      temperature: req.temperature,
      maxOutputTokens: req.maxTokens,
    };
    // Gemini 3 models always think. `thinkingBudget: 0` is rejected outright (400), so `'none'`
    // means "as little as the model allows" rather than off — which is still the difference
    // between an answer and a response that spends its whole budget thinking and returns empty
    // text with finishReason MAX_TOKENS.
    if (req.reasoningEffort) {
      generationConfig.thinkingConfig = {
        thinkingLevel: req.reasoningEffort === 'none' ? 'low' : req.reasoningEffort,
      };
    }
    if (req.json) {
      generationConfig.responseMimeType = 'application/json';
      if (options.responseSchema) generationConfig.responseSchema = options.responseSchema;
    }

    let response: Response;
    try {
      response = await fetch(
        `${baseUrl}/v1beta/models/${options.model}:streamGenerateContent?alt=sse`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': options.apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: req.system }] },
            contents: toContents(req.messages),
            generationConfig,
          }),
          signal,
        },
      );
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
        let envelope: GeminiEnvelope;
        try {
          envelope = JSON.parse(frame.data) as GeminiEnvelope;
        } catch {
          continue;
        }

        const candidate = envelope.candidates?.[0];
        for (const part of candidate?.content?.parts ?? []) {
          if (part.text) yield { type: 'text', text: part.text };
        }
        if (candidate?.finishReason === 'MAX_TOKENS')
          finish = { type: 'done', finishReason: 'length' };
        else if (
          candidate?.finishReason === 'SAFETY' ||
          candidate?.finishReason === 'PROHIBITED_CONTENT'
        ) {
          finish = { type: 'done', finishReason: 'content-filter' };
        }

        if (envelope.usageMetadata) {
          usage = {
            tokensIn: envelope.usageMetadata.promptTokenCount ?? 0,
            tokensOut: envelope.usageMetadata.candidatesTokenCount ?? 0,
            cachedTokensIn: envelope.usageMetadata.cachedContentTokenCount ?? 0,
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

    if (usage) yield { type: 'usage', usage };
    yield req.signal.aborted ? { type: 'done', finishReason: 'abort' } : finish;
  }

  return {
    id: 'gemini',
    model: options.model,
    supportsVision: options.supportsVision ?? true,
    pricePerMTokIn: options.pricePerMTokIn,
    pricePerMTokOut: options.pricePerMTokOut,
    chat,
  };
}
