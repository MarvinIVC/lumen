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

import { ASK_SYSTEM, buildAskUser } from './ask.ts';
import type { BuildAskPromptInput } from './ask.ts';
import { DOMAIN_TEMPLATE_BLOCKS, domainTemplateBlock } from './domains.ts';
import { DETECT_SYSTEM } from './detect.ts';
import { RUBRIC_SYSTEM } from './rubric.ts';
import { VERIFY_SYSTEM, verifySystem } from './verify.ts';

export { PROMPT_VERSION } from '../versions.ts';
export { RUBRIC_SYSTEM, DOMAIN_TEMPLATE_BLOCKS, DETECT_SYSTEM, VERIFY_SYSTEM, verifySystem };
export { ASK_SYSTEM };
export type { BuildAskPromptInput } from './ask.ts';
export { SCHEMA_BLOCK } from './schema-block.ts';

export interface BuildEnhancePromptInput {
  context: NoteContext;
  options: EnhanceOptions;
  packBlock: CurriculumPackBlock | null;
  titleHint?: string;
  /** The extracted notes, verbatim. May contain `[IMAGE: alt/ocr]` markers. */
  extract: string;
  /** Set to regenerate one section instead of the whole document (phase-05 §10). */
  scope?: RegenerateScope;
}

/**
 * "Do this one section again" (phase-05 §10).
 *
 * The whole of the request lives in the volatile run instruction — deliberately, and it is the
 * reason this is a field on the existing input rather than a prompt of its own. A regenerate wants
 * the same rubric, the same curriculum pack and the same domain template as the generation it is
 * amending; assembling them the same way means the cached prefix is byte-identical to a full run's,
 * so the section a student re-rolls costs input tokens at the cached rate like everything else.
 */
export interface RegenerateScope {
  sectionId: string;
  sectionTitle: string;
  /** The section as it stands, as json — what the model is being asked to improve on. */
  currentSection: string;
  /** The student's own words: "add a worked example with real numbers". */
  instruction?: string;
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
  );

  if (input.scope) {
    lines.push(...regenerateLines(input.scope));
  } else {
    lines.push('Produce the NoteDocument json now.');
  }
  return lines.join('\n');
}

/**
 * The scoped tail.
 *
 * Two things it insists on, both because the alternative is a document the client cannot use:
 * the reply is a single section under a `section` key rather than a bare array or a whole
 * document, and it keeps the id it was given. Section ids are what every `sectionId` in the
 * document points at — the flashcards, the quiz, the corrections, the outline — and a regenerate
 * that renamed one would strand all of them at once. The client re-imposes the id anyway
 * (`replaceSection`), but a model that returns the right one is a model that understood the task.
 */
export const REGENERATE_INSTRUCTION = [
  'REGENERATE ONE SECTION ONLY. Do not return the whole document.',
  'Return json of exactly this shape and nothing else:',
  '{ "section": { "id": string, "title": string, "level": 2|3, "blocks": [ …block schema… ] },',
  '  "corrections": [...], "openQuestions": [...], "glossary": [...] }',
  'The three lists are optional and must only contain entries about this section.',
  'Keep the section id you were given. Obey the same rubric and the same block schema as a full',
  'document, including every rule about formulas, units, captions, alt text and provenance.',
].join('\n');

function regenerateLines(scope: RegenerateScope): string[] {
  const lines = [
    REGENERATE_INSTRUCTION,
    `SECTION ID: ${scope.sectionId}`,
    `SECTION HEADING: ${scope.sectionTitle}`,
    '--- BEGIN CURRENT SECTION JSON ---',
    scope.currentSection,
    '--- END CURRENT SECTION JSON ---',
  ];
  if (scope.instruction?.trim()) {
    lines.push(
      "STUDENT'S INSTRUCTION FOR THIS REWRITE (follow it unless it would make the section wrong):",
      scope.instruction.trim(),
    );
  }
  lines.push('Produce the section json now.');
  return lines;
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

/**
 * The ask-about-this prompt (§11). Not cached: the passage is different every time, and at this
 * size there is nothing above it worth caching.
 */
export function buildAskPrompt(input: BuildAskPromptInput): BuiltPrompt {
  return {
    system: ASK_SYSTEM,
    messages: [{ role: 'user', content: buildAskUser(input) }],
    cachePrefix: ASK_SYSTEM,
  };
}
