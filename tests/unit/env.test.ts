import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseClientEnv } from '@/lib/env';
import { SECRET_ENV_KEYS, parseServerEnv } from '@/lib/env.server';

const ROOT = resolve(import.meta.dirname, '../..');
const EXAMPLE = readFileSync(resolve(ROOT, '.env.example'), 'utf8');

const declared = new Set(
  EXAMPLE.split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split('=')[0]!.trim()),
);

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'a'.repeat(40),
};

describe('client env', () => {
  it('accepts a minimal valid environment and applies defaults', () => {
    const env = parseClientEnv(valid);
    expect(env.NEXT_PUBLIC_APP_NAME).toBe('Lumen');
    expect(env.NEXT_PUBLIC_ENV).toBe('local');
    expect(env.NEXT_PUBLIC_SENTRY_ENABLED).toBe(false);
  });

  it('throws a message naming the missing variable', () => {
    expect(() => parseClientEnv({ NEXT_PUBLIC_SUPABASE_ANON_KEY: 'a'.repeat(40) })).toThrowError(
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
  });

  it('throws for every missing required variable at once, not just the first', () => {
    let message = '';
    try {
      parseClientEnv({});
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(message).toMatch(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    expect(message).toMatch(/\.env\.example/);
  });

  it('rejects a malformed URL rather than passing it through', () => {
    expect(() => parseClientEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: 'not-a-url' })).toThrowError(
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
  });

  it('coerces the booleanish flags', () => {
    expect(
      parseClientEnv({ ...valid, NEXT_PUBLIC_SENTRY_ENABLED: 'true' }).NEXT_PUBLIC_SENTRY_ENABLED,
    ).toBe(true);
    expect(
      parseClientEnv({ ...valid, NEXT_PUBLIC_SENTRY_ENABLED: '1' }).NEXT_PUBLIC_SENTRY_ENABLED,
    ).toBe(true);
    expect(
      parseClientEnv({ ...valid, NEXT_PUBLIC_SENTRY_ENABLED: '' }).NEXT_PUBLIC_SENTRY_ENABLED,
    ).toBe(false);
  });
});

describe('server env', () => {
  it('rejects a BYOK encryption key that is too short to be a secretbox key', () => {
    expect(() => parseServerEnv({ BYOK_ENC_KEY: 'short' })).toThrowError(/BYOK_ENC_KEY/);
  });

  it('parses an empty environment, because every secret is optional until its phase', () => {
    expect(() => parseServerEnv({})).not.toThrow();
  });
});

describe('.env.example', () => {
  it('documents every secret the schema knows about', () => {
    for (const key of SECRET_ENV_KEYS) expect(declared, `missing ${key}`).toContain(key);
  });

  it('documents every public variable the schema knows about', () => {
    const publicKeys = [
      'NEXT_PUBLIC_APP_NAME',
      'NEXT_PUBLIC_APP_URL',
      'NEXT_PUBLIC_ENV',
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
      'NEXT_PUBLIC_SENTRY_DSN',
      'NEXT_PUBLIC_SENTRY_ENABLED',
      'NEXT_PUBLIC_ANALYTICS_BEACON_URL',
      'NEXT_PUBLIC_CF_ANALYTICS_TOKEN',
    ];
    for (const key of publicKeys) expect(declared, `missing ${key}`).toContain(key);
  });

  it('never marks a secret as public', () => {
    for (const key of SECRET_ENV_KEYS) expect(key.startsWith('NEXT_PUBLIC_')).toBe(false);
  });

  it('ships no real secret values', () => {
    for (const key of SECRET_ENV_KEYS) {
      const line = EXAMPLE.split('\n').find((l) => l.trim().startsWith(`${key}=`));
      expect(line?.trim(), `${key} has a value in .env.example`).toBe(`${key}=`);
    }
  });
});
