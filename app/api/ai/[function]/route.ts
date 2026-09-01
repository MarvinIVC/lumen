import { clientEnv } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server.server';

const FUNCTIONS = new Set(['enhance', 'detect', 'ocr', 'ask', 'usage', 'byok', 'delete-account']);

/**
 * Same-origin bridge for Edge Functions. The browser never sees the Supabase access token; this
 * handler reads the httpOnly session and attaches it after validating the user. Signed-out calls
 * still carry their signed anonymous id, so their three-per-day allowance is unchanged.
 */
async function proxy(request: Request, name: string): Promise<Response> {
  if (!FUNCTIONS.has(name)) return Response.json({ error: 'not_found' }, { status: 404 });
  const supabase = await createSupabaseServerClient();
  const user = await supabase.auth.getUser();
  const session = user.data.user ? await supabase.auth.getSession() : null;
  const authorization = session?.data.session?.access_token
    ? `Bearer ${session.data.session.access_token}`
    : `Bearer ${clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY}`;
  const headers = new Headers({
    apikey: clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    authorization,
  });
  const contentType = request.headers.get('content-type');
  const anonId = request.headers.get('x-lumen-anon-id');
  if (contentType) headers.set('content-type', contentType);
  if (anonId) headers.set('x-lumen-anon-id', anonId);
  const upstream = await fetch(
    new URL(`/functions/v1/${name}`, clientEnv.NEXT_PUBLIC_SUPABASE_URL),
    {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      duplex: 'half',
    } as RequestInit,
  );
  const responseHeaders = new Headers();
  for (const key of ['content-type', 'cache-control', 'x-lumen-anon-id']) {
    const value = upstream.headers.get(key);
    if (value) responseHeaders.set(key, value);
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export async function GET(request: Request, context: { params: Promise<{ function: string }> }) {
  return proxy(request, (await context.params).function);
}

export async function POST(request: Request, context: { params: Promise<{ function: string }> }) {
  return proxy(request, (await context.params).function);
}

export async function DELETE(request: Request, context: { params: Promise<{ function: string }> }) {
  return proxy(request, (await context.params).function);
}
