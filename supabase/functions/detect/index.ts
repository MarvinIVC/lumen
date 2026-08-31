/**
 * detect — Stage A, the cheap one (04-AI-ENGINE.md §3).
 *
 * The client only calls this when its local heuristic scored under 0.7, so most notes never reach
 * a model at all. 300 output tokens at temperature 0, and the result pre-fills a form the student
 * can overwrite — which is why every failure here answers 200 with `null` rather than an error: a
 * detection we could not make is a field they fill in, never a blocked button.
 */
import { loadConfig } from '../_shared/config.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createGuardrailStore } from '../_shared/guardrails.ts';
import { isConfigured } from '../_shared/db.ts';
import { error, json, serve } from '../_shared/response.ts';
import { resolveCaller, ANON_HEADER } from '../_shared/auth.ts';
import { writeUsage } from '../_shared/ledger.ts';
import { buildDetectPrompt } from '../../../lib/ai/prompts/index.ts';
import { largestValidJson } from '../../../lib/ai/stream-parse.ts';
import { route } from '../../../lib/ai/router.ts';
import type { CallerRequest } from '../_shared/auth.ts';
import type { DetectionResult } from '../../../lib/ai/schema.ts';

interface DetectBody extends CallerRequest {
  extract?: string;
}

const CURRICULA = new Set([
  'AP',
  'IB_HL',
  'IB_SL',
  'A_LEVEL',
  'IGCSE',
  'INTERNAL',
  'GENERAL',
  'UNKNOWN',
]);

function coerce(value: unknown): DetectionResult | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const str = (key: string): string => (typeof raw[key] === 'string' ? (raw[key] as string) : '');
  const nullable = (key: string): string | null => (str(key) ? str(key) : null);
  const curriculum = str('curriculum').toUpperCase();
  if (!str('subject') && !str('course')) return null;

  return {
    subject: str('subject') || 'General',
    curriculum: (CURRICULA.has(curriculum)
      ? curriculum
      : 'UNKNOWN') as DetectionResult['curriculum'],
    course: str('course'),
    unit: nullable('unit'),
    topic: nullable('topic'),
    language: str('language') || 'en',
    isStudyNotes: raw.isStudyNotes !== false,
    confidence: typeof raw.confidence === 'number' ? Math.min(1, Math.max(0, raw.confidence)) : 0.5,
    notes: str('notes'),
  };
}

serve(async (request) => {
  if (request.method !== 'POST') return error(request, 'method_not_allowed', 'POST only.', 405);
  if (!isConfigured()) {
    return error(request, 'not_configured', 'This deployment has no database configured.', 500);
  }

  let body: DetectBody;
  try {
    body = (await request.json()) as DetectBody;
  } catch {
    return error(request, 'bad_request', 'Expected a JSON body.', 400);
  }
  const extract = typeof body.extract === 'string' ? body.extract.slice(0, 8000) : '';
  if (!extract.trim()) return error(request, 'bad_request', 'Nothing to classify.', 400);

  const config = await loadConfig();
  const resolved = await resolveCaller(request, body);
  if (resolved.refusal) {
    return error(request, resolved.refusal.code, resolved.refusal.message, resolved.refusal.status);
  }

  const decision = await route(
    {
      caller: resolved.caller,
      kind: 'detect',
      config,
      context: {
        subject: '',
        curriculum: 'UNKNOWN',
        course: '',
        unit: null,
        topic: null,
        language: 'en',
      },
      options: { mode: 'tidy', depth: 'match', visuals: 'auto', voice: 'keep-mine' },
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
    return json(request, { error: decision.reason, message: decision.message }, 429);
  }

  const prompt = buildDetectPrompt(extract);
  const controller = new AbortController();
  request.signal.addEventListener('abort', () => controller.abort());

  let text = '';
  let tokensIn = 0;
  let tokensOut = 0;
  let cachedTokensIn = 0;

  for await (const chunk of decision.provider.chat({
    system: prompt.system,
    cachePrefix: prompt.cachePrefix,
    messages: prompt.messages,
    json: true,
    maxTokens: decision.maxTokens,
    temperature: decision.temperature,
    timeoutMs: decision.timeoutMs,
    ...(decision.reasoningEffort ? { reasoningEffort: decision.reasoningEffort } : {}),
    signal: controller.signal,
  })) {
    if (chunk.type === 'text') text += chunk.text;
    else if (chunk.type === 'usage') {
      tokensIn = chunk.usage.tokensIn;
      tokensOut = chunk.usage.tokensOut;
      cachedTokensIn = chunk.usage.cachedTokensIn ?? 0;
    }
  }

  if (tokensIn || tokensOut) {
    await writeUsage({
      caller: { userId: resolved.caller.userId, anonId: resolved.caller.anonId },
      kind: 'detect',
      usage: {
        tokensIn,
        tokensOut,
        cachedTokensIn,
        byModel: { [decision.provider.model]: { tokensIn, tokensOut, cachedTokensIn } },
        provider: decision.provider.id,
        model: decision.provider.model,
        fallbackUsed: false,
        cacheHit: cachedTokensIn > 0,
        // Detection is machinery, not something a student asked for: logged for cost, never billed.
        charged: false,
      },
      credits: 0,
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

  return new Response(JSON.stringify(coerce(largestValidJson(text))), { status: 200, headers });
});
