/**
 * Prompt assembly (04-AI-ENGINE.md §4.1).
 *
 * Order is load-bearing for prefix caching — stable content first, volatile content last:
 *   system  = RUBRIC_SYSTEM            (identical for every call of a schema version)  ← cached
 *   user[0] = CURRICULUM_PACK_BLOCK    (identical across a course's calls)             ← cached
 *   user[1] = DOMAIN_TEMPLATE_BLOCK    (per domain family, small)                      ← cached
 *   user[2] = RUN_INSTRUCTION          (options + context + the extracted notes)       ← volatile
 *
 * The prompt bodies themselves are written in phase-04. Anything that changes a string here must
 * bump PROMPT_VERSION and re-run `pnpm test:ai`.
 */
import type { ChatMessage } from '../provider';
import type { CurriculumPackBlock } from '@/lib/curriculum/load';
import type { DomainFamily, EnhanceOptions, NoteContext } from '../schema';

export { PROMPT_VERSION } from '../versions';

/** The standing instruction — 04-AI-ENGINE.md §4.2. Written in phase-04. */
export declare const RUBRIC_SYSTEM: string;

/** Per-family structure guidance that also restates the JSON schema — §4.3. */
export declare const DOMAIN_TEMPLATE_BLOCKS: Record<DomainFamily, string>;

/** Stage A classifier prompt — §3. */
export declare const DETECT_SYSTEM: string;

/** Stage C examiner prompt — §6. */
export declare const VERIFY_SYSTEM: string;

export interface BuildEnhancePromptInput {
  context: NoteContext;
  options: EnhanceOptions;
  packBlock: CurriculumPackBlock | null;
  titleHint?: string;
  /** The extracted notes, verbatim. May contain `[IMAGE: alt/ocr]` markers. */
  extract: string;
}

export interface BuiltPrompt {
  system: string;
  messages: ChatMessage[];
  /** The stable prefix, for providers that take an explicit cache hint. */
  cachePrefix: string;
}

export declare function buildEnhancePrompt(input: BuildEnhancePromptInput): BuiltPrompt;

export declare function buildDetectPrompt(extract: string): BuiltPrompt;

export declare function buildVerifyPrompt(input: {
  syllabusBlock: string;
  originalNotes: string;
  draftJson: string;
  subject: string;
}): BuiltPrompt;

/** §4.5 — the volatile tail. Kept separate so tests can assert nothing stable leaks into it. */
export declare function buildRunInstruction(input: BuildEnhancePromptInput): string;
