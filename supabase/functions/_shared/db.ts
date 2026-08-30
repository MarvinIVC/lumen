/**
 * PostgREST, by hand.
 *
 * The functions talk to their own database over HTTP with the service-role key, and every query
 * they make is either a call to one of the two functions in `0001_ai_engine.sql` or a single-row
 * read of `app_config`. That is little enough that `@supabase/supabase-js` would be a dependency
 * bought for two conveniences we do not need — and one fewer npm specifier is one fewer thing that
 * can fail at deploy time rather than at typecheck time.
 */
const url = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

export function isConfigured(): boolean {
  return Boolean(url && serviceKey);
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    'content-type': 'application/json',
    ...extra,
  };
}

export async function select<T>(path: string): Promise<T[]> {
  const response = await fetch(`${url}/rest/v1/${path}`, { headers: headers() });
  if (!response.ok)
    throw new Error(`select ${path} failed: ${response.status} ${await response.text()}`);
  return (await response.json()) as T[];
}

export async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(args),
  });
  if (!response.ok)
    throw new Error(`rpc ${name} failed: ${response.status} ${await response.text()}`);
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** Verifies a Supabase access token and returns the user id, or null. */
export async function userIdFromJwt(token: string): Promise<string | null> {
  try {
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: serviceKey, authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const user = (await response.json()) as { id?: string };
    return user.id ?? null;
  } catch {
    return null;
  }
}
