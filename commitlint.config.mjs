/** Conventional Commits — see CONTRIBUTING.md */
const config = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      1,
      'always',
      [
        'app',
        'ai',
        'ci',
        'curriculum',
        'deps',
        'design',
        'export',
        'ingest',
        'marketing',
        'render',
        'store',
        'supabase',
        'tests',
        'tooling',
      ],
    ],
  },
};

export default config;
