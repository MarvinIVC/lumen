import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Two projects, two CI jobs:
 *   `unit`     — everything under tests/unit. Fast, no network, runs on every push.
 *   `ai-evals` — the release gate for prompt changes (04-AI-ENGINE.md §9). Runs against a mock
 *                provider in CI and, from phase-04, nightly against the real key on a tiny budget.
 */
export default defineConfig({
  resolve: { alias: { '@': resolve(import.meta.dirname, '.') } },
  test: {
    // `lib/env.ts` validates at import time, by design. Give the suite the same local Supabase
    // defaults `.env.example` ships so importing app modules works without a .env.local.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-0000000000000000000000',
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'ai-evals',
          include: ['tests/ai-evals/**/*.test.ts'],
          environment: 'node',
          // Model calls are slow even when mocked through a stream.
          testTimeout: 60_000,
        },
      },
    ],
  },
});
