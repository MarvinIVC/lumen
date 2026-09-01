/**
 * ask — "ask about this" (phase-05 §11).
 *
 * Its own function rather than a mode of `enhance`, which is the call phase-04's log recommended
 * after measuring what `runEnhance` actually is: a JSON pipeline with a tolerant streaming parser,
 * a schema validator, a repair ladder, a tidy retry and a verify pass. None of that has anything
 * to offer a two-sentence answer, and threading a `json: false` flag through all of it would make
 * every one of those stages carry a branch for the one caller that skips them.
 *
 * What it does share is everything before the model: the same `resolveCaller`, the same `route`,
 * the same refusal statuses, the same ledger. A cheap endpoint that skipped the guardrails would
 * be the cheapest way to spend our key, so it is the one part that is not simplified.
 *
 * The response is SSE because the deltas are worth showing — a student who selected a phrase and
 * asked a question is watching the box — and because it costs nothing: the same writer the
 * enhance function already uses.
 */
import { loadConfig } from '../_shared/config.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createGuardrailStore } from '../_shared/guardrails.ts';
import { isConfigured } from '../_shared/db.ts';
import { error, json, serve } from '../_shared/response.ts';
import { resolveCaller, ANON_HEADER } from '../_shared/auth.ts';
import { sseResponse } from '../_shared/stream.ts';
import { writeUsage } from '../_shared/ledger.ts';
import { runAsk } from '../../../lib/ai/ask.ts';
import { route } from '../../../lib/ai/router.ts';
import type { AskUsage } from '../../../lib/ai/ask.ts';
import type { CallerRequest } from '../_shared/auth.ts';
import type { RefusalReason } from '../../../lib/ai/router.ts';

interface AskBody extends CallerRequest {
  selection?: string;
  question?: string;
  sectionText?: string;
  course?: string;
  curriculum?: string;
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

/**
 * Length caps, applied here rather than trusted from the client.
 *
 * A selection is a passage of the student's own note; a question is a sentence. Neither has a
 * legitimate reason to be long, and both are the parts of this request that a caller controls
 * completely — which makes them the input budget an abusive client would reach for first.
 */
const MAX_SELECTION = 4000;
const MAX_QUESTION = 500;
const MAX_SECTION = 6000;

serve(async (request) => {
  if (request.method !== 'POST') return error(request, 'method_not_allowed', 'POST only.', 405);
  if (!isConfigured()) {
    return error(request, 'not_configured', 'This deployment has no database configured.', 500);
  }

  let body: AskBody;
  try {
    body = (await request.json()) as AskBody;
  } catch {
    return error(request, 'bad_request', 'Expected a JSON body.', 400);
  }

  const selection =
    typeof body.selection === 'string' ? body.selection.slice(0, MAX_SELECTION) : '';
  const question = typeof body.question === 'string' ? body.question.slice(0, MAX_QUESTION) : '';
  if (!selection.trim()) return error(request, 'bad_request', 'Nothing was selected.', 400);
  if (!question.trim()) return error(request, 'bad_request', 'There was no question.', 400);

  const config = await loadConfig();
  const resolved = await resolveCaller(request, body);
  if (resolved.refusal) {
    return error(request, resolved.refusal.code, resolved.refusal.message, resolved.refusal.status);
  }

  const context = {
    subject: '',
    curriculum: 'UNKNOWN' as const,
    course: typeof body.course === 'string' ? body.course : '',
    unit: null,
    topic: null,
    language: typeof body.language === 'string' ? body.language : 'en',
  };

  const decision = await route(
    {
      caller: resolved.caller,
      kind: 'ask',
      config,
      context,
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

  const headers: Record<string, string> = resolved.issuedAnonId
    ? { [ANON_HEADER]: resolved.issuedAnonId }
    : {};

  return sseResponse(request, headers, async (writer) => {
    const controller = new AbortController();
    request.signal.addEventListener('abort', () => controller.abort());

    let usage: AskUsage | null = null;
    if (resolved.issuedAnonId) writer.send('anon', { anonId: resolved.issuedAnonId });

    try {
      for await (const event of runAsk({
        provider: decision.provider,
        input: {
          selection,
          question,
          course: context.course,
          curriculum: typeof body.curriculum === 'string' ? body.curriculum : 'UNKNOWN',
          language: context.language,
          ...(typeof body.sectionText === 'string'
            ? { sectionText: body.sectionText.slice(0, MAX_SECTION) }
            : {}),
        },
        maxTokens: decision.maxTokens,
        temperature: decision.temperature,
        timeoutMs: decision.timeoutMs,
        ...(decision.reasoningEffort ? { reasoningEffort: decision.reasoningEffort } : {}),
        signal: controller.signal,
      })) {
        if (event.type === 'usage') {
          usage = event.usage;
          continue;
        }
        const { type, ...rest } = event;
        writer.send(type, rest);
      }
    } finally {
      if (usage) {
        const record = await writeUsage({
          caller: { userId: resolved.caller.userId, anonId: resolved.caller.anonId },
          kind: 'ask',
          usage,
          credits: decision.credits,
          pricing: config.pricing,
          ipHash: resolved.ipHash,
          byok: Boolean(resolved.caller.byok),
        }).catch((cause: unknown) => {
          console.error('ledger write failed', cause);
          return null;
        });

        writer.send('usage', {
          tokensIn: usage.tokensIn,
          tokensOut: usage.tokensOut,
          costCny: record?.costCny ?? null,
          credits: record?.credits ?? 0,
          model: usage.model,
          provider: usage.provider,
        });
      }
      writer.send('done', { status: usage?.charged ? 'answered' : 'ended' });
    }
  });
});

export { corsHeaders };
