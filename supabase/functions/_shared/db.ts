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

/** Insert or update, with the conflict target PostgREST needs to resolve an upsert. */
export async function upsert<T>(
  table: string,
  row: Record<string, unknown>,
  onConflict: string,
): Promise<T[]> {
  const response = await fetch(
    `${url}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`,
    {
      method: 'POST',
      headers: headers({ prefer: 'resolution=merge-duplicates,return=representation' }),
      body: JSON.stringify(row),
    },
  );
  if (!response.ok)
    throw new Error(`upsert ${table} failed: ${response.status} ${await response.text()}`);
  return (await response.json()) as T[];
}

/** A filtered update. `filter` is a PostgREST query string, e.g. `id=eq.123`. */
export async function patch<T>(
  table: string,
  filter: string,
  row: Record<string, unknown>,
): Promise<T[]> {
  const response = await fetch(`${url}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: headers({ prefer: 'return=representation' }),
    body: JSON.stringify(row),
  });
  if (!response.ok)
    throw new Error(`patch ${table} failed: ${response.status} ${await response.text()}`);
  return (await response.json()) as T[];
}

export interface AuthUser {
  id: string;
  emailConfirmed: boolean;
}

/** Verifies a Supabase access token and returns the quota-relevant user state. */
export async function userFromJwt(token: string): Promise<AuthUser | null> {
  try {
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: serviceKey, authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const user = (await response.json()) as { id?: string; email_confirmed_at?: string | null };
    return user.id ? { id: user.id, emailConfirmed: Boolean(user.email_confirmed_at) } : null;
  } catch {
    return null;
  }
}
