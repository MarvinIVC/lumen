/**
 * Storing and reaching an integration's token (02-ARCHITECTURE.md §4, §6).
 *
 * The ciphertext never leaves this side: `0004` revokes the column grant so a signed-in browser
 * cannot select its own `token_ciphertext`, which is phase-06 #8 applied to the second secret this
 * product holds. Everything here runs with the service role, inside a function.
 */
import { decryptSecret, encryptSecret } from './crypto.ts';
import { patch, select, upsert } from './db.ts';

export type IntegrationKind = 'notion' | 'drive';

export interface IntegrationRow {
  id: string;
  owner: string;
  kind: IntegrationKind;
  token_ciphertext: string | null;
  refresh_ciphertext: string | null;
  expires_at: string | null;
  account_label: string | null;
  revoked: boolean;
  meta: Record<string, unknown> | null;
}

export async function saveIntegration(input: {
  owner: string;
  kind: IntegrationKind;
  accessToken: string;
  refreshToken?: string | null;
  expiresInSeconds?: number | null;
  accountLabel?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await upsert(
    'integration',
    {
      owner: input.owner,
      kind: input.kind,
      token_ciphertext: await encryptSecret(input.accessToken),
      refresh_ciphertext: input.refreshToken ? await encryptSecret(input.refreshToken) : null,
      expires_at: input.expiresInSeconds
        ? new Date(Date.now() + input.expiresInSeconds * 1000).toISOString()
        : null,
      account_label: input.accountLabel ?? null,
      revoked: false,
      meta: input.meta ?? {},
      updated_at: new Date().toISOString(),
    },
    'owner,kind',
  );
}

export async function loadIntegration(
  owner: string,
  kind: IntegrationKind,
): Promise<IntegrationRow | null> {
  const rows = await select<IntegrationRow>(
    `integration?owner=eq.${owner}&kind=eq.${kind}&limit=1`,
  );
  return rows[0] ?? null;
}

export async function decryptToken(row: IntegrationRow): Promise<string | null> {
  return row.token_ciphertext ? decryptSecret(row.token_ciphertext) : null;
}

/**
 * Marks a connection as needing re-authorisation.
 *
 * 06 §3: "Token revoked → clear + re-auth, never lose the note." The row is kept and flagged
 * rather than deleted, so the target mapping in `meta` survives — reconnecting then lands the
 * note back in the database it was already going to, instead of asking the student to choose
 * again as though nothing had ever been set up.
 */
export async function markRevoked(owner: string, kind: IntegrationKind): Promise<void> {
  await patch('integration', `owner=eq.${owner}&kind=eq.${kind}`, {
    revoked: true,
    token_ciphertext: null,
    refresh_ciphertext: null,
    updated_at: new Date().toISOString(),
  });
}

export async function saveMeta(
  owner: string,
  kind: IntegrationKind,
  meta: Record<string, unknown>,
): Promise<void> {
  await patch('integration', `owner=eq.${owner}&kind=eq.${kind}`, {
    meta,
    updated_at: new Date().toISOString(),
  });
}

/** Where the app lives, for redirects back out of a function. */
export function siteUrl(): string {
  return (Deno.env.get('PUBLIC_SITE_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
}

/** This function's own public URL, which is what an OAuth provider must be given as the redirect. */
export function callbackUrl(fn: string): string {
  const base = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
  return `${base}/functions/v1/${fn}`;
}
