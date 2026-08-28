import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import betterTailwind from 'eslint-plugin-better-tailwindcss';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

/**
 * Files that are allowed to read secrets: the env module itself, anything explicitly marked
 * `.server.ts`, and the config/tooling layer that runs at build time.
 */
const SERVER_ONLY = [
  'lib/env.ts',
  '**/*.server.ts',
  '**/*.server.tsx',
  '*.config.ts',
  '*.config.mjs',
  'instrumentation.ts',
  'sentry.*.config.ts',
  'scripts/**',
  'tests/**',
  'eslint.config.mjs',
];

/**
 * The rule behind "no secret is referenced in any client component" (phase-00 DoD).
 * Anything read off `process.env` that is not NEXT_PUBLIC_* is a secret by definition, and the
 * only correct way to reach one is `serverEnv()` inside code that never ships to the browser.
 * `tests/unit/no-client-secrets.test.ts` backs this up by grepping the built bundle.
 */
const noSecretEnv = {
  'no-restricted-syntax': [
    'error',
    {
      // NEXT_PUBLIC_* is public by definition; NODE_ENV / NEXT_RUNTIME are build-time flags the
      // framework itself sets and inlines. Everything else on process.env is a secret.
      selector:
        "MemberExpression[object.object.name='process'][object.property.name='env'][property.name!=/^(NEXT_PUBLIC_.*|NODE_ENV|NEXT_RUNTIME)$/]",
      message:
        'Secrets must not be read outside server-only code. Use serverEnv() from lib/env.ts in a ' +
        '.server.ts file or an edge function; use clientEnv for NEXT_PUBLIC_* values.',
    },
    {
      selector:
        "MemberExpression[computed=true][object.object.name='process'][object.property.name='env']",
      message:
        'Dynamic process.env access hides secrets from review and is not inlined by Next. ' +
        'Reference the variable literally via clientEnv or serverEnv().',
    },
  ],
};

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      '.open-next/**',
      '.wrangler/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      '.lighthouseci/**',
      'next-env.d.ts',
      'cloudflare-env.d.ts',
      // Deno runtime, its own toolchain: `deno lint` via `supabase functions serve`.
      'supabase/functions/**',
      'fixtures/**',
      'public/sw.js',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'jsx-a11y': jsxA11y, 'better-tailwindcss': betterTailwind },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    settings: {
      'better-tailwindcss': { entryPoint: 'app/globals.css' },
    },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,

      // Catches a class that is not a real utility — the usual cause of a token typo.
      'better-tailwindcss/no-unknown-classes': ['error', { ignore: ['^sr-only$'] }],
      'better-tailwindcss/no-conflicting-classes': 'error',
      'better-tailwindcss/no-duplicate-classes': 'error',
      // Class *order* is Prettier's job (prettier-plugin-tailwindcss), not ESLint's — two sorters
      // disagreeing would make the pre-commit hook oscillate.

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',

      ...noSecretEnv,
    },
  },

  {
    files: SERVER_ONLY,
    rules: { 'no-restricted-syntax': 'off' },
  },

  {
    files: ['scripts/**/*.mjs', '*.config.{mjs,ts}'],
    languageOptions: { globals: globals.node },
    rules: { '@typescript-eslint/no-unused-vars': 'off' },
  },

  prettier,
);
