/**
 * Prompt & schema versioning (04-AI-ENGINE.md §10).
 *
 * `note.doc` records the versions it was generated with, and a migration layer upgrades old docs
 * so they still render.
 *
 * SCHEMA 1.1.0 (phase-05) gave every block an optional `id`. It is additive, so a 1.0.0 document
 * is still valid; `migrateNoteDocument` mints the ids on the way past. Nothing in `prompts/`
 * mentions SCHEMA_VERSION, so bumping it does not move the cached prefix.
 *
 * PROMPT 1.3.0 (phase-05) added the `scope` lines that ask for a single section rather than a
 * document. They live in the volatile run instruction, below the cache boundary, so the prefix is
 * byte-identical to 1.2.0's — but the version still moves, because the rule is about the prompt
 * text and not about where in it the edit landed. Changing any prompt text requires re-running `pnpm test:ai` and bumping
 * PROMPT_VERSION — which invalidates the provider's prefix cache. That is expected and fine.
 */
export const SCHEMA_VERSION = '1.1.0';
export const PROMPT_VERSION = '1.3.0';

export type SchemaVersion = typeof SCHEMA_VERSION;
export type PromptVersion = typeof PROMPT_VERSION;
