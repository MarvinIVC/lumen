/**
 * usage — what the QuotaMeter shows (01-PRODUCT.md §6).
 *
 * A read, so it never mints an anon id and never asks for Turnstile: a browser that has not spent
 * anything yet has its whole allowance, and saying so costs nothing. It reads the same snapshot the
 * guardrails read, so the number a student sees and the number that refuses them are the same
 * number, from the same query.
 */
import { loadConfig } from '../_shared/config.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createGuardrailStore } from '../_shared/guardrails.ts';
import { isConfigured } from '../_shared/db.ts';
import { error, json, serve } from '../_shared/response.ts';
import { verifyAnonId, clientIp, hashIp } from '../_shared/auth.ts';
import { userFromJwt } from '../_shared/db.ts';
import type { Tier } from '../../../lib/ai/router.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

serve(async (request) => {
  if (!isConfigured()) {
    return error(request, 'not_configured', 'This deployment has no database configured.', 500);
  }

  const config = await loadConfig();
  const authorization = request.headers.get('authorization') ?? '';
  const bearer = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7) : null;
  const isAnonKey = bearer === Deno.env.get('SUPABASE_ANON_KEY');
  const user = bearer && !isAnonKey ? await userFromJwt(bearer) : null;
  const userId = user?.id ?? null;
  const anonId = userId ? null : await verifyAnonId(request.headers.get('x-lumen-anon-id'));
  const tier: Tier = user?.emailConfirmed ? 'verified' : 'anon';

  const quota = config.quota[tier];
  const enhanceTotal = quota?.enhance_per_day ?? 0;
  const ocrTotal = quota?.ocr_per_day ?? 0;

  if (!userId && !anonId) {
    // Nothing spent, because nothing could have been: this browser has never been issued an id.
    return json(request, {
      tier,
      enabled: config.enhance_enabled,
      enhance: { used: 0, total: enhanceTotal, resetsAt: null },
      ocr: { used: 0, total: ocrTotal, resetsAt: null },
    });
  }

  const store = createGuardrailStore(await hashIp(clientIp(request)));
  const snapshot = await store.snapshot({ tier, userId, anonId }, 'enhance');
  const resetsAt = snapshot.oldestEventLast24h
    ? new Date(new Date(snapshot.oldestEventLast24h).getTime() + DAY_MS).toISOString()
    : null;

  return new Response(
    JSON.stringify({
      tier,
      enabled: config.enhance_enabled,
      enhance: { used: snapshot.creditsLast24h.enhance, total: enhanceTotal, resetsAt },
      ocr: { used: snapshot.creditsLast24h.ocr, total: ocrTotal, resetsAt },
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        // A quota that is cached is a quota that lies. It is one indexed query.
        'cache-control': 'no-store',
        ...corsHeaders(request),
      },
    },
  );
});
