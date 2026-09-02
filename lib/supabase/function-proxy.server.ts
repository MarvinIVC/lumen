import { clientEnv } from '@/lib/env';
import { createSupabaseServerClient } from './server.server';

/**
 * The same-origin bridge to a Supabase edge function.
 *
 * Phase-06's boundary in one place: the browser never sees a Supabase access token, so this reads
 * the httpOnly session and attaches it server-side. Signed-out calls still carry their signed
 * anonymous id, so a signed-out student's allowance is unchanged.
 *
 * Shared by `/api/ai/[function]` and `/api/integrations/[function]` because the two differ only in
 * which functions they will call — and an allowlist that exists twice is an allowlist that will
 * eventually say two different things.
 */
export async function proxyToFunction(
  request: Request,
  name: string,
  allowed: ReadonlySet<string>,
): Promise<Response> {
  if (!allowed.has(name)) return Response.json({ error: 'not_found' }, { status: 404 });

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
  // The content type is forwarded rather than assumed: `drive-push` sends multipart form data with
  // a generated boundary, and rewriting it would make the body unparseable at the other end.
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
