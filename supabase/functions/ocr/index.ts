/**
 * ocr — reading a photographed or scanned page (01-PRODUCT.md §2 step 3).
 *
 * Same guardrails as `enhance`, its own line in the quota (`ocr_per_day`), and one rule of its own:
 * the transcription must not improve on the page. What comes back here lands in the review screen
 * as an editable block, and anything invented at this step becomes a fact the enhancement stage
 * will faithfully build a lesson on. The prompt says so at length; this function's job is to make
 * sure a failure costs nothing.
 */
import { loadConfig } from '../_shared/config.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createGuardrailStore } from '../_shared/guardrails.ts';
import { isConfigured } from '../_shared/db.ts';
import { error, json, serve } from '../_shared/response.ts';
import { resolveCaller, ANON_HEADER } from '../_shared/auth.ts';
import { writeUsage } from '../_shared/ledger.ts';
import { OCR_SYSTEM } from '../../../lib/ai/prompts/ocr.ts';
import { largestValidJson } from '../../../lib/ai/stream-parse.ts';
import { route } from '../../../lib/ai/router.ts';
import type { CallerRequest } from '../_shared/auth.ts';
import type { RefusalReason } from '../../../lib/ai/router.ts';

interface OcrBody extends CallerRequest {
  /** A data: URL. Images never travel as a Storage path with a service key (04 §2). */
  image?: string;
  language?: string;
}

const REFUSAL_STATUS: Record<RefusalReason, number> = {
  'kill-switch': 503,
  'monthly-cap': 429,
  'daily-cap': 429,
  quota: 429,
  'not-study-notes': 422,
  'too-large': 413,
  'rate-limited': 429,
};

/** Base64 is ~4/3 of the bytes it encodes; this is `limits.max_bytes` with that allowed for. */
const MAX_DATA_URL = 36_000_000;

serve(async (request) => {
  if (request.method !== 'POST') return error(request, 'method_not_allowed', 'POST only.', 405);
  if (!isConfigured()) {
    return error(request, 'not_configured', 'This deployment has no database configured.', 500);
  }

  let body: OcrBody;
  try {
    body = (await request.json()) as OcrBody;
  } catch {
    return error(request, 'bad_request', 'Expected a JSON body.', 400);
  }

  const image = typeof body.image === 'string' ? body.image : '';
  const match = /^data:(image\/[a-z0-9.+-]+);base64,/i.exec(image);
  if (!match) return error(request, 'bad_request', 'Expected an image as a data: URL.', 400);
  if (image.length > MAX_DATA_URL) {
    return error(
      request,
      'too_large',
      'That image is too large to read. Try a smaller photo.',
      413,
    );
  }

  const config = await loadConfig();
  if (config.feature_flags.ocr_enabled === false) {
    return json(
      request,
      { error: 'kill-switch', message: 'Reading photographs is paused right now.' },
      503,
    );
  }

  const resolved = await resolveCaller(request, body);
  if (resolved.refusal) {
    return error(request, resolved.refusal.code, resolved.refusal.message, resolved.refusal.status);
  }

  const decision = await route(
    {
      caller: resolved.caller,
      kind: 'ocr',
      config,
      context: {
        subject: '',
        curriculum: 'UNKNOWN',
        course: '',
        unit: null,
        topic: null,
        language: body.language ?? 'en',
      },
      options: { mode: 'tidy', depth: 'match', visuals: 'none', voice: 'keep-mine' },
    },
    {
      store: createGuardrailStore(resolved.ipHash),
      keys: {
        deepseek: Deno.env.get('DEEPSEEK_API_KEY') ?? '',
        gemini: Deno.env.get('GEMINI_API_KEY') ?? '',
        deepseekBaseUrl: Deno.env.get('DEEPSEEK_BASE_URL') ?? '',
      },
    },
  );

  if (!decision.ok) {
    return json(
      request,
      {
        error: decision.reason,
        message: decision.message,
        resetsAt: decision.resetsAt ?? null,
        byokHelps: decision.reason !== 'kill-switch' && decision.reason !== 'rate-limited',
      },
      REFUSAL_STATUS[decision.reason],
    );
  }

  const controller = new AbortController();
  request.signal.addEventListener('abort', () => controller.abort());

  const chatRequest = {
    system: OCR_SYSTEM,
    cachePrefix: OCR_SYSTEM,
    messages: [
      {
        role: 'user' as const,
        content: [
          {
            type: 'text' as const,
            text: `Transcribe this page. The notes are written in ${body.language ?? 'the language shown'}.`,
          },
          { type: 'image' as const, url: image, mimeType: match[1] ?? 'image/jpeg' },
        ],
      },
    ],
    json: true,
    maxTokens: decision.maxTokens,
    temperature: decision.temperature,
    signal: controller.signal,
  };

  let text = '';
  let tokensIn = 0;
  let tokensOut = 0;
  let cachedTokensIn = 0;
  let failed = false;
  let provider = decision.provider;
  let fallbackUsed = false;

  for (const attempt of [decision.provider, decision.fallback]) {
    if (!attempt) break;
    provider = attempt;
    text = '';
    failed = false;
    for await (const chunk of attempt.chat(chatRequest)) {
      if (chunk.type === 'text') text += chunk.text;
      else if (chunk.type === 'usage') {
        tokensIn += chunk.usage.tokensIn;
        tokensOut += chunk.usage.tokensOut;
        cachedTokensIn += chunk.usage.cachedTokensIn ?? 0;
      } else if (chunk.type === 'error') {
        failed = chunk.error.retryable;
        if (!chunk.error.retryable) break;
      }
    }
    if (!failed) break;
    fallbackUsed = true;
  }

  const parsed = largestValidJson(text) as
    { text?: string; confidence?: number; unreadable?: string[] } | undefined;
  const recognised = typeof parsed?.text === 'string' ? parsed.text : '';
  const charged = recognised.trim().length > 0;

  if (tokensIn || tokensOut) {
    await writeUsage({
      caller: { userId: resolved.caller.userId, anonId: resolved.caller.anonId },
      kind: 'ocr',
      usage: {
        tokensIn,
        tokensOut,
        cachedTokensIn,
        byModel: { [provider.model]: { tokensIn, tokensOut, cachedTokensIn } },
        provider: provider.id,
        model: provider.model,
        fallbackUsed,
        cacheHit: cachedTokensIn > 0,
        charged,
      },
      credits: decision.credits,
      pricing: config.pricing,
      ipHash: resolved.ipHash,
      byok: Boolean(resolved.caller.byok),
    }).catch((cause: unknown) => console.error('ledger write failed', cause));
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    ...corsHeaders(request),
    ...(resolved.issuedAnonId ? { [ANON_HEADER]: resolved.issuedAnonId } : {}),
  };

  if (!charged) {
    return new Response(
      JSON.stringify({
        error: 'unreadable',
        message: 'We could not read anything on that page. Try a sharper photo, or type it in.',
      }),
      { status: 422, headers },
    );
  }

  return new Response(
    JSON.stringify({
      text: recognised,
      confidence: typeof parsed?.confidence === 'number' ? parsed.confidence : 0.5,
      unreadable: Array.isArray(parsed?.unreadable) ? parsed.unreadable : [],
      credits: decision.credits,
    }),
    { status: 200, headers },
  );
});
