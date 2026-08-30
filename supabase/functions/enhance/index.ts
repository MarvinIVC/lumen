/**
 * enhance — the heart of the product (04-AI-ENGINE.md).
 *
 * The order of business, and every line of it is load-bearing:
 *
 *   1. Work out who is calling (JWT, or a signed anon id minted behind Turnstile).
 *   2. Ask the router. It refuses — before a single token is spent — on the kill switch, either
 *      spend cap, the per-tier quota, the anonymous lifetime cap or the per-IP rate limit. A
 *      refusal is a plain JSON response with a status, because nothing has streamed yet and an
 *      SSE stream carrying an error the client has to parse out is worse in every way.
 *   3. Assemble the prompt *here*. The pack block is built server-side from the repo's own packs;
 *      the client sends context and notes, never prompt text.
 *   4. Run the pipeline and forward its events as SSE.
 *   5. Write the ledger — always, including for a refusal, an abort or a failure, because those
 *      cost real money. What they do not do is charge a credit.
 *
 * The pipeline itself is `lib/ai/enhance.ts`, shared verbatim with the eval harness. This function
 * is the part that cannot be tested without a database: auth, guardrails, streaming and the ledger.
 */
import { loadConfig } from '../_shared/config.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createGuardrailStore } from '../_shared/guardrails.ts';
import { isConfigured } from '../_shared/db.ts';
import { error, json, serve } from '../_shared/response.ts';
import { resolveCaller, ANON_HEADER } from '../_shared/auth.ts';
import { sseResponse } from '../_shared/stream.ts';
import { writeUsage } from '../_shared/ledger.ts';
import { buildPackBlock, genericBlock, matchPack } from '../../../lib/curriculum/load.ts';
import { domainFamilyFor } from '../../../lib/curriculum/detect.ts';
import { runEnhance } from '../../../lib/ai/enhance.ts';
import { createVerifier, route } from '../../../lib/ai/router.ts';
import { staticPackSource } from '../../../lib/curriculum/registry.ts';
import type { CallerRequest } from '../_shared/auth.ts';
import type { RunUsage } from '../../../lib/ai/enhance.ts';
import type { CallKind, RefusalReason } from '../../../lib/ai/router.ts';
import type { EnhanceOptions, NoteContext } from '../../../lib/ai/schema.ts';

interface EnhanceBody extends CallerRequest {
  context?: Partial<NoteContext>;
  options?: Partial<EnhanceOptions>;
  extract?: string;
  titleHint?: string;
  kind?: CallKind;
}

/** A refusal the student can act on maps to a status their client already branches on. */
const REFUSAL_STATUS: Record<RefusalReason, number> = {
  'kill-switch': 503,
  'monthly-cap': 429,
  'daily-cap': 429,
  quota: 429,
  'not-study-notes': 422,
  'too-large': 413,
  'rate-limited': 429,
};

const DEFAULT_OPTIONS: EnhanceOptions = {
  mode: 'complete',
  depth: 'match',
  visuals: 'auto',
  voice: 'keep-mine',
};

serve(async (request) => {
  if (request.method !== 'POST') return error(request, 'method_not_allowed', 'POST only.', 405);
  if (!isConfigured()) {
    return error(request, 'not_configured', 'This deployment has no database configured.', 500);
  }

  let body: EnhanceBody;
  try {
    body = (await request.json()) as EnhanceBody;
  } catch {
    return error(request, 'bad_request', 'Expected a JSON body.', 400);
  }

  const extract = typeof body.extract === 'string' ? body.extract : '';
  if (!extract.trim()) {
    return error(request, 'bad_request', 'There were no notes in that request.', 400);
  }

  const config = await loadConfig();
  if (extract.length > config.limits.max_chars) {
    return error(
      request,
      'too_large',
      `Those notes are ${extract.length.toLocaleString()} characters and the limit for one lesson is ${config.limits.max_chars.toLocaleString()}. Split them into separate lessons.`,
      413,
    );
  }

  const resolved = await resolveCaller(request, body);
  if (resolved.refusal) {
    return error(request, resolved.refusal.code, resolved.refusal.message, resolved.refusal.status);
  }

  const context: NoteContext = {
    subject: body.context?.subject ?? 'General',
    curriculum: body.context?.curriculum ?? 'UNKNOWN',
    course: body.context?.course ?? '',
    unit: body.context?.unit ?? null,
    topic: body.context?.topic ?? null,
    language: body.context?.language ?? 'en',
    domainFamily:
      body.context?.domainFamily ??
      domainFamilyFor(body.context?.subject ?? '', body.context?.curriculum ?? 'UNKNOWN'),
  };
  const options: EnhanceOptions = { ...DEFAULT_OPTIONS, ...body.options };
  const kind: CallKind = body.kind === 'regen' ? 'regen' : 'enhance';

  const store = createGuardrailStore(resolved.ipHash);
  const keys = {
    deepseek: Deno.env.get('DEEPSEEK_API_KEY') ?? '',
    gemini: Deno.env.get('GEMINI_API_KEY') ?? '',
    deepseekBaseUrl: Deno.env.get('DEEPSEEK_BASE_URL') ?? '',
  };
  const decision = await route(
    { caller: resolved.caller, kind, config, context, options },
    { store, keys },
  );

  if (!decision.ok) {
    return json(
      request,
      {
        error: decision.reason,
        message: decision.message,
        resetsAt: decision.resetsAt ?? null,
        // BYOK is unaffected by both caps, and saying so at the moment of refusal is the whole
        // point of having the option (01-PRODUCT.md §5).
        byokHelps: decision.reason !== 'kill-switch' && decision.reason !== 'rate-limited',
      },
      REFUSAL_STATUS[decision.reason],
    );
  }

  /* Prompt assembly — server-side, always. --------------------------------- */
  const match = await matchPack(context, staticPackSource);
  const packBlock = match ? buildPackBlock(match) : genericBlock(context);
  if (match) context.packId = match.pack.id;

  // A student on their own key gets their own model checking its own work, which is the only
  // honest option: we are not going to spend the shared budget verifying a BYOK generation.
  const verifier = resolved.caller.byok ? decision.provider : createVerifier(config, keys, options);
  const headers = resolved.issuedAnonId ? { [ANON_HEADER]: resolved.issuedAnonId } : {};

  return sseResponse(request, headers, async (writer) => {
    const controller = new AbortController();
    // The student pressing "Cancel" closes the connection; that has to stop the spending, not just
    // stop the rendering.
    request.signal.addEventListener('abort', () => controller.abort());

    let usage: RunUsage | null = null;

    if (resolved.issuedAnonId) writer.send('anon', { anonId: resolved.issuedAnonId });

    try {
      for await (const event of runEnhance({
        provider: decision.provider,
        fallback: decision.fallback,
        verifier,
        input: {
          context,
          options,
          packBlock,
          ...(body.titleHint ? { titleHint: body.titleHint } : {}),
          extract,
        },
        maxTokens: decision.maxTokens,
        temperature: decision.temperature,
        verifyTokens: config.limits.max_tokens.verify ?? 3000,
        verifyFamilies: config.verify_families,
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
          kind,
          usage,
          credits: decision.credits,
          pricing: config.pricing,
          ipHash: resolved.ipHash,
          byok: Boolean(resolved.caller.byok),
        }).catch((cause) => {
          // A ledger write that fails must not lose the student their note — but it must be loud,
          // because the global cap is only as good as this table.
          console.error('ledger write failed', cause);
          return null;
        });

        writer.send('usage', {
          tokensIn: usage.tokensIn,
          tokensOut: usage.tokensOut,
          cachedTokensIn: usage.cachedTokensIn,
          cacheHit: usage.cacheHit,
          fallbackUsed: usage.fallbackUsed,
          costCny: record?.costCny ?? null,
          credits: record?.credits ?? 0,
          model: usage.model,
          provider: usage.provider,
        });
      }
      writer.send('done', { status: usage?.charged ? 'ready' : 'ended' });
    }
  });
});

export { corsHeaders };
