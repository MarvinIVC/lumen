/**
 * Prompt assembly (04-AI-ENGINE.md §4.1).
 *
 * Order is load-bearing for prefix caching — stable content first, volatile content last:
 *   system  = RUBRIC_SYSTEM            (identical for every call of a schema version)  ← cached
 *   user[0] = CURRICULUM_PACK_BLOCK    (identical across a course's calls)             ← cached
 *   user[1] = DOMAIN_TEMPLATE_BLOCK    (per domain family, small)                      ← cached
 *   user[2] = RUN_INSTRUCTION          (options + context + the extracted notes)       ← volatile
 *
 * The cache boundary is the start of `user[2]`, and the rule that keeps it working is negative:
 * nothing above it may contain a timestamp, a note id, a title, a filename or a formatted date.
 * That is why `buildEnhancePrompt` takes no clock and no id, and why
 * `tests/unit/prompt-cache.test.ts` asserts two different notes on the same course produce a
 * byte-identical prefix. A regression there is invisible in the output and costs ~31x on input.
 *
 * Anything that changes a string here must bump PROMPT_VERSION and re-run `pnpm test:ai` (§10).
 */
import type { ChatMessage } from '../provider.ts';
import type { CurriculumPackBlock } from '../../curriculum/load.ts';
import type { DomainFamily, EnhanceOptions, NoteContext } from '../schema.ts';

import { DOMAIN_TEMPLATE_BLOCKS, domainTemplateBlock } from './domains.ts';
import { DETECT_SYSTEM } from './detect.ts';
import { RUBRIC_SYSTEM } from './rubric.ts';
import { VERIFY_SYSTEM, verifySystem } from './verify.ts';

export { PROMPT_VERSION } from '../versions.ts';
export { RUBRIC_SYSTEM, DOMAIN_TEMPLATE_BLOCKS, DETECT_SYSTEM, VERIFY_SYSTEM, verifySystem };
export { SCHEMA_BLOCK } from './schema-block.ts';

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

/** Human-readable option lines. Deliberately terse — the model reads these last and literally. */
const MODE_NOTE: Record<EnhanceOptions['mode'], string> = {
  tidy: 'tidy — structure, correct and complete what is already there. Add nothing new beyond fixes and definitions.',
  complete:
    'complete — rebuild the lesson: fill the gaps a teacher would expect, finish every example, add the visuals that help.',
  study_guide:
    'study_guide — complete, plus the fullest set of study tools and a revision-ready structure.',
};

const DEPTH_NOTE: Record<EnhanceOptions['depth'], string> = {
  match: 'match — mirror the depth the student was actually taught at.',
  thorough: 'thorough — go one level deeper than the notes, still within the syllabus scope.',
  brief: 'brief — the shortest treatment that is still complete and correct.',
};

const VISUALS_NOTE: Record<EnhanceOptions['visuals'], string> = {
  auto: 'auto — add a visual only where it genuinely aids understanding.',
  more: 'more — prefer a diagram, chart or structure wherever one would help at all.',
  none: 'none — no diagram, chart or structure blocks at all.',
};

const VOICE_NOTE: Record<EnhanceOptions['voice'], string> = {
  'keep-mine':
    "keep-mine — tighten the student's phrasing, do not replace it. Their words stay theirs.",
  textbook: 'textbook — rewrite in a clean textbook register, while keeping their examples.',
};

/**
 * §4.5 — the volatile tail. Kept separate so tests can assert nothing stable leaks into it, and
 * more importantly that nothing volatile leaks *out* of it into the cached prefix.
 */
export function buildRunInstruction(input: BuildEnhancePromptInput): string {
  const { context, options, titleHint, extract } = input;
  const lines = [
    `CONTEXT: subject=${context.subject} curriculum=${context.curriculum} course=${context.course} unit=${context.unit ?? '—'} topic=${context.topic ?? '—'} language=${context.language}`,
    `OPTIONS: mode=${options.mode} depth=${options.depth} visuals=${options.visuals} voice=${options.voice}`,
    `  mode: ${MODE_NOTE[options.mode]}`,
    `  depth: ${DEPTH_NOTE[options.depth]}`,
    `  visuals: ${VISUALS_NOTE[options.visuals]}`,
    `  voice: ${VOICE_NOTE[options.voice]}`,
  ];
  if (titleHint) lines.push(`TITLE HINT: ${titleHint}`);
  lines.push(
    '--- BEGIN STUDENT NOTES (verbatim, may include [IMAGE: alt/ocr]) ---',
    extract,
    '--- END STUDENT NOTES ---',
    'Produce the NoteDocument json now.',
  );
  return lines.join('\n');
}

export function buildEnhancePrompt(input: BuildEnhancePromptInput): BuiltPrompt {
  const packText = input.packBlock?.text ?? '';
  const domainText = domainTemplateBlock(input.context.domainFamily as DomainFamily | undefined);
  const cachePrefix = [RUBRIC_SYSTEM, packText, domainText].join('\n\n');

  return {
    system: RUBRIC_SYSTEM,
    messages: [
      { role: 'user', content: packText },
      { role: 'user', content: domainText },
      { role: 'user', content: buildRunInstruction(input) },
    ],
    cachePrefix,
  };
}

export function buildDetectPrompt(extract: string): BuiltPrompt {
  return {
    system: DETECT_SYSTEM,
    messages: [{ role: 'user', content: extract }],
    cachePrefix: DETECT_SYSTEM,
  };
}

export function buildVerifyPrompt(input: {
  syllabusBlock: string;
  originalNotes: string;
  draftJson: string;
  subject: string;
}): BuiltPrompt {
  const system = verifySystem(input.subject);
  return {
    system,
    messages: [
      {
        role: 'user',
        content: [
          `SYLLABUS BLOCK:\n${input.syllabusBlock || '(no pack — judge against standard treatment at this level)'}`,
          `ORIGINAL NOTES:\n${input.originalNotes}`,
          `DRAFT DOCUMENT JSON:\n${input.draftJson}`,
        ].join('\n\n'),
      },
    ],
    cachePrefix: system,
  };
}
