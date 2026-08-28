/**
 * Public environment (02-ARCHITECTURE.md §6). NEXT_PUBLIC_* only.
 *
 * The secrets live in a separate module, `env.server.ts`, and nothing here imports it. That is
 * deliberate: if both halves shared a file, the secret *names* would ride into the client bundle
 * inside the Zod schema even though the values never would. Keeping them apart means the built
 * bundle contains no trace of a secret at all — which is what
 * `tests/unit/no-client-secrets.test.ts` asserts.
 *
 * Every variable here must also appear in `.env.example`; `tests/unit/env.test.ts` enforces that.
 */
import { z } from 'zod';

/**
 * `.env` files cannot express "absent" — an unset optional variable arrives as an empty string.
 * Without this, a blank NEXT_PUBLIC_SENTRY_DSN would fail URL validation and break the build.
 */
export const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const booleanish = z
  .enum(['true', 'false', '1', '0', ''])
  .default('false')
  .transform((value) => value === 'true' || value === '1');

/* ------------------------------------------------------------------ *
 * Public — shipped to the browser. Never put a secret in this schema.
 * ------------------------------------------------------------------ */
const clientSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default('Lumen'),
  NEXT_PUBLIC_APP_URL: z.url().default('http://localhost:3000'),
  NEXT_PUBLIC_ENV: z.enum(['local', 'preview', 'production']).default('local'),

  // Required: the app cannot talk to its own backend without these.
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),

  NEXT_PUBLIC_TURNSTILE_SITE_KEY: optional(z.string()),
  NEXT_PUBLIC_SENTRY_DSN: optional(z.url()),
  NEXT_PUBLIC_SENTRY_ENABLED: booleanish,
  NEXT_PUBLIC_ANALYTICS_BEACON_URL: optional(z.url()),
  NEXT_PUBLIC_CF_ANALYTICS_TOKEN: optional(z.string()),
});

export type ClientEnv = z.infer<typeof clientSchema>;

export class EnvError extends Error {
  override name = 'EnvError';
}

/** Shared by this module and `env.server.ts`, so both failures read the same way. */
export function formatEnvError(scope: string, error: z.ZodError): never {
  const lines = error.issues.map((issue) => {
    const key = issue.path.join('.') || '(root)';
    const detail =
      issue.code === 'invalid_type' && !('received' in issue) ? 'missing' : issue.message;
    return `  • ${key}: ${detail}`;
  });
  throw new EnvError(
    `Invalid ${scope} environment.\n${lines.join('\n')}\n\n` +
      `Copy .env.example to .env.local and fill these in. ` +
      `Every variable is documented there, split into public and secret.`,
  );
}

/**
 * Referenced literally so that Next can statically inline each value into the client bundle —
 * `process.env` is not a real object in the browser, so a spread or a dynamic key would yield
 * undefined. Do not refactor this into a loop.
 */
const rawClientEnv = {
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_ENV: process.env.NEXT_PUBLIC_ENV,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_SENTRY_ENABLED: process.env.NEXT_PUBLIC_SENTRY_ENABLED,
  NEXT_PUBLIC_ANALYTICS_BEACON_URL: process.env.NEXT_PUBLIC_ANALYTICS_BEACON_URL,
  NEXT_PUBLIC_CF_ANALYTICS_TOKEN: process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN,
};

/** Parses the public env. Exported for tests; app code should use `clientEnv`. */
export function parseClientEnv(source: Record<string, unknown> = rawClientEnv): ClientEnv {
  const result = clientSchema.safeParse(source);
  if (!result.success) formatEnvError('public', result.error);
  return result.data;
}

/** Validated at module load — a missing required public var fails the boot, loudly. */
export const clientEnv: ClientEnv = parseClientEnv();
