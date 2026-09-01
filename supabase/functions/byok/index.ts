/**
 * byok — validating and sealing a student's own API key (02-ARCHITECTURE.md §7).
 *
 * The flow, decided with the user and recorded here because it is not what `02` §6 assumes:
 *
 *   the key is posted here once → validated with a one-token call to the student's own provider →
 *   encrypted with BYOK_ENC_KEY → **the ciphertext is returned to the browser**, which stores it
 *   and replays it on every later call.
 *
 * `02` §6 puts the ciphertext in `profile.byok`, which needs an account, and accounts are phase-06.
 * Holding the sealed blob on the device instead means BYOK works today, for signed-out students,
 * with the same security property that matters: only this server can open it, so a stolen blob is
 * worth nothing, and the plaintext key exists in memory here for the length of one request and is
 * never written anywhere. When accounts land, the same ciphertext moves into `profile.byok`
 * without anyone re-entering anything.
 *
 * The key is never logged, never echoed, and never returned — not even masked.
 */
import { corsHeaders } from '../_shared/cors.ts';
import { decryptSecret, encryptSecret } from '../_shared/crypto.ts';
import { userFromJwt } from '../_shared/db.ts';
import { error, json, serve } from '../_shared/response.ts';
import { createProvider } from '../../../lib/ai/providers/index.ts';
import type { ProviderId } from '../../../lib/ai/provider.ts';

interface ByokBody {
  provider?: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  ciphertext?: string;
}

const PROVIDERS = new Set<ProviderId>(['deepseek', 'gemini', 'openai-compatible', 'anthropic']);

serve(async (request) => {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const user = bearer ? await userFromJwt(bearer) : null;

  if (request.method === 'GET') {
    if (!user) return error(request, 'unauthorized', 'Sign in to load your saved key.', 401);
    const stored = await readProfileByok(user.id);
    return noStore(request, stored ? toClient(stored) : null);
  }
  if (request.method === 'DELETE') {
    if (!user) return error(request, 'unauthorized', 'Sign in to remove your saved key.', 401);
    await writeProfileByok(user.id, null);
    return noStore(request, { ok: true });
  }
  if (request.method !== 'POST') return error(request, 'method_not_allowed', 'POST only.', 405);
  if (!Deno.env.get('BYOK_ENC_KEY')) {
    return error(
      request,
      'not_configured',
      'This deployment cannot store your own key yet. Nothing has been saved.',
      500,
    );
  }

  let body: ByokBody;
  try {
    body = (await request.json()) as ByokBody;
  } catch {
    return error(request, 'bad_request', 'Expected a JSON body.', 400);
  }

  const provider = String(body.provider ?? '') as ProviderId;
  const model = String(body.model ?? '').trim();
  const apiKey = String(body.apiKey ?? '').trim();
  const baseUrl = body.baseUrl ? String(body.baseUrl).trim() : undefined;

  if (!PROVIDERS.has(provider)) return error(request, 'bad_request', 'Unknown provider.', 400);
  if (!model) return error(request, 'bad_request', 'Which model should we use with that key?', 400);
  if (baseUrl && !/^https:\/\//i.test(baseUrl)) {
    // A plaintext base URL would send the student's key over the wire in the clear.
    return error(request, 'bad_request', 'The base URL has to start with https://.', 400);
  }

  // First sign-in can move an existing sealed local key without asking for the plaintext again.
  if (body.ciphertext) {
    if (!user) return error(request, 'unauthorized', 'Sign in to sync your saved key.', 401);
    if (!(await decryptSecret(body.ciphertext))) {
      return error(
        request,
        'bad_request',
        'That saved key could not be opened. Add it again.',
        400,
      );
    }
    const stored = profileValue(provider, model, baseUrl, body.ciphertext);
    await writeProfileByok(user.id, stored);
    return noStore(request, toClient(stored));
  }
  if (!apiKey) return error(request, 'bad_request', 'No key was sent.', 400);

  /* One token, to prove the key works before we tell a student it is saved. ---- */
  // Same rule as the router: DeepSeek means wherever this deployment's DeepSeek is.
  const endpoint =
    baseUrl ??
    (provider === 'deepseek' ? Deno.env.get('DEEPSEEK_BASE_URL') || undefined : undefined);
  const test = createProvider({
    id: provider,
    model,
    apiKey,
    ...(endpoint ? { baseUrl: endpoint } : {}),
    pricePerMTokIn: 0,
    pricePerMTokOut: 0,
    supportsVision: true,
  });

  let failure: string | null = null;
  let sawText = false;
  try {
    for await (const chunk of test.chat({
      system: 'Reply with the single word: ok',
      messages: [{ role: 'user', content: 'ok' }],
      json: false,
      // Not one token. A model that reasons before answering spends the whole budget thinking and
      // returns empty text, which this function then reports as "the provider accepted the key but
      // returned nothing" — rejecting a key that works perfectly. Ask for as little reasoning as
      // the provider allows and leave room for an actual word.
      maxTokens: 16,
      temperature: 0,
      reasoningEffort: 'none',
      timeoutMs: 30_000,
      signal: AbortSignal.timeout(30_000),
    })) {
      if (chunk.type === 'text') sawText = true;
      if (chunk.type === 'error') {
        failure =
          chunk.error.kind === 'auth'
            ? 'That key was refused by the provider. Check you copied all of it.'
            : `The provider answered: ${chunk.error.message}`;
      }
    }
  } catch (cause) {
    failure = cause instanceof Error ? cause.message : 'The provider could not be reached.';
  }

  if (failure) return json(request, { error: 'key_rejected', message: failure }, 400);
  if (!sawText) {
    return json(
      request,
      {
        error: 'key_rejected',
        message: 'The provider accepted the key but returned nothing. Check the model name.',
      },
      400,
    );
  }

  const ciphertext = await encryptSecret(apiKey);
  const stored = profileValue(provider, model, baseUrl, ciphertext);
  if (user) await writeProfileByok(user.id, stored);

  return noStore(request, toClient(stored));
});

interface ProfileByok {
  provider: ProviderId;
  model: string;
  base_url: string | null;
  key_ciphertext: string;
  saved_at: string;
}

function profileValue(
  provider: ProviderId,
  model: string,
  baseUrl: string | undefined,
  ciphertext: string,
): ProfileByok {
  return {
    provider,
    model,
    base_url: baseUrl ?? null,
    key_ciphertext: ciphertext,
    saved_at: new Date().toISOString(),
  };
}

function toClient(value: ProfileByok) {
  return {
    provider: value.provider,
    model: value.model,
    baseUrl: value.base_url,
    ciphertext: value.key_ciphertext,
    savedAt: Date.parse(value.saved_at),
  };
}

async function readProfileByok(userId: string): Promise<ProfileByok | null> {
  const response = await fetch(
    `${Deno.env.get('SUPABASE_URL')}/rest/v1/profile?id=eq.${userId}&select=byok`,
    { headers: serviceHeaders() },
  );
  if (!response.ok) throw new Error(`BYOK profile read failed: ${response.status}`);
  const rows = (await response.json()) as { byok?: ProfileByok | null }[];
  return rows[0]?.byok ?? null;
}

async function writeProfileByok(userId: string, value: ProfileByok | null): Promise<void> {
  const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/profile?id=eq.${userId}`, {
    method: 'PATCH',
    headers: { ...serviceHeaders(), prefer: 'return=minimal' },
    body: JSON.stringify({ byok: value }),
  });
  if (!response.ok) throw new Error(`BYOK profile write failed: ${response.status}`);
}

function serviceHeaders(): Record<string, string> {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' };
}

function noStore(request: Request, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...corsHeaders(request),
    },
  });
}
