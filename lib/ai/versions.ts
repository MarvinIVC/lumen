/**
 * Prompt & schema versioning (04-AI-ENGINE.md §10).
 *
 * `note.doc` records the versions it was generated with, and a migration layer upgrades old docs
 * so they still render. Changing any prompt text requires re-running `pnpm test:ai` and bumping
 * PROMPT_VERSION — which invalidates the provider's prefix cache. That is expected and fine.
 */
export const SCHEMA_VERSION = '1.0.0';
export const PROMPT_VERSION = '1.0.0';

export type SchemaVersion = typeof SCHEMA_VERSION;
export type PromptVersion = typeof PROMPT_VERSION;
