/**
 * Secret environment (02-ARCHITECTURE.md §6). Server-only, and enforced three ways:
 *
 *   1. This module is never imported by a client component. Its filename ends in `.server.ts`,
 *      which is also the ESLint allowlist marker for reading non-public `process.env` values.
 *   2. `serverEnv()` throws outright if it is somehow reached from the browser.
 *   3. `tests/unit/no-client-secrets.test.ts` greps the built client bundle for every name here.
 *
 * In production these values are Supabase Function secrets and Cloudflare Worker secrets, not
 * files. Nothing in this list is ever prefixed NEXT_PUBLIC_.
 */
import { z } from 'zod';

import { EnvError, formatEnvError, optional } from './env';

const serverSchema = z.object({
  DEEPSEEK_API_KEY: optional(z.string().min(1)),
  GEMINI_API_KEY: optional(z.string().min(1)),
  BYOK_ENC_KEY: optional(z.string().min(32)),
  NOTION_OAUTH_CLIENT_ID: optional(z.string()),
  NOTION_OAUTH_CLIENT_SECRET: optional(z.string()),
  // Drive's client belongs to its own Google Cloud project — the consent screen and its
  // verification status are per project, and `drive.file` is a sensitive scope. The name is what
  // stops sign-in's credentials being pasted in here. See `.env.example`.
  GOOGLE_DRIVE_OAUTH_CLIENT_ID: optional(z.string()),
  GOOGLE_DRIVE_OAUTH_CLIENT_SECRET: optional(z.string()),
  // Signs the `state` that carries a student's identity through an OAuth round trip, because the
  // callback is an edge function on another origin and cannot read the app's session.
  INTEGRATION_STATE_SECRET: optional(z.string().min(16)),
  SUPABASE_SERVICE_ROLE_KEY: optional(z.string().min(20)),
  SENTRY_DSN: optional(z.url()),
  TURNSTILE_SECRET: optional(z.string()),
  KEEPALIVE_SECRET: optional(z.string()),
});

export type ServerEnv = z.infer<typeof serverSchema>;

/** Every secret name. Used by the leak test and by `.env.example` coverage. */
export const SECRET_ENV_KEYS = Object.keys(serverSchema.shape) as (keyof ServerEnv)[];

/** Exported for tests; app code should use `serverEnv()`. */
export function parseServerEnv(source: Record<string, unknown>): ServerEnv {
  const result = serverSchema.safeParse(source);
  if (!result.success) formatEnvError('secret', result.error);
  return result.data;
}

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new EnvError('serverEnv() was called in the browser. Secrets never reach the client.');
  }
  cached ??= parseServerEnv(process.env);
  return cached;
}
