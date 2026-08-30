/**
 * Pack loader (05-CURRICULUM-PACKS.md §2 "Loader behaviour").
 *
 * Packs are static JSON in the repo, not rows in the database (02-ARCHITECTURE.md §4), so they
 * version with the code and cost nothing to serve.
 *
 * Matching: `curriculum` + `subject`, fuzzy on `displayName`/`course`; then the confirmed unit
 * against `units[].id`/`name` (the review screen lets the user correct a bad match). No match
 * falls back to the generic block (§4).
 *
 * `listPacks`, `loadPack` and `matchPack` are the review screen's (phase-03), so the
 * pack-availability badge is real rather than mocked. `buildPackBlock` and `genericBlock` render
 * the prompt text that phase-04 caches — see the note on TARGET_TOKENS below for why they take no
 * clock and no id.
 */
import { approxTokens } from '@/lib/ai/tokens';

import type { CurriculumPack, PackTopic, PackUnit } from './types';
import type { Curriculum, NoteContext } from '@/lib/ai/schema';

export type { CurriculumPack, PackTopic, PackUnit } from './types';

export interface PackSummary {
  id: string;
  displayName: string;
  subject: string;
  curriculum: Curriculum;
  status: CurriculumPack['status'];
  unitCount: number;
}

interface Manifest {
  packs: PackSummary[];
}

/**
 * Every pack shipped in `lib/curriculum/packs/`, without parsing the full bodies.
 *
 * The manifest is a separate file rather than a directory scan because the packs have to be
 * enumerable in the browser, where there is no directory to scan. It lives outside `packs/` so
 * `pnpm pack:validate`, which validates every `.json` in there against the pack schema, does not
 * try to validate the index as a pack.
 *
 * It is empty until phase-05 authors the first pack. Everything downstream has to handle that —
 * "no pack for this course" is a supported, unremarkable state (05-CURRICULUM-PACKS.md §4), not a
 * degraded one, and the review screen says so in those words.
 */
export async function listPacks(): Promise<PackSummary[]> {
  const manifest = (await import('./manifest.json')) as unknown as {
    default: Manifest;
  };
  return manifest.default?.packs ?? [];
}

export async function loadPack(packId: string): Promise<CurriculumPack | null> {
  if (!/^[a-z0-9-]+$/.test(packId)) return null;
  try {
    const loaded = await import(`./packs/${packId}.json`);
    return (loaded.default ?? loaded) as CurriculumPack;
  } catch {
    return null;
  }
}

export interface PackMatch {
  pack: CurriculumPack;
  unit: PackUnit | null;
  /**
   * The topics the lesson actually seems to be about, when the confirmed context named one.
   * Empty means "the whole unit" — see `buildPackBlock` for why the distinction is what keeps the
   * pack block inside its token budget.
   */
  topics: PackTopic[];
  /** 0–1. Below the loader's threshold the review screen asks the student to confirm. */
  confidence: number;
}

/**
 * Curriculum + subject first, then a fuzzy pass over the course name — a student who typed
 * "AP Chem" should still land on the AP Chemistry pack.
 */
export async function matchPack(context: NoteContext): Promise<PackMatch | null> {
  const packs = await listPacks();
  if (packs.length === 0) return null;

  const course = context.course.toLowerCase();
  const subject = context.subject.toLowerCase();

  const scored = packs
    .map((summary) => {
      let score = 0;
      if (summary.curriculum === context.curriculum) score += 0.5;
      if (summary.subject.toLowerCase() === subject) score += 0.3;
      const name = summary.displayName.toLowerCase();
      if (name === course) score += 0.2;
      else if (course && (name.includes(course) || course.includes(name))) score += 0.12;
      // A draft pack should not be chosen over a stable one on a tie.
      if (summary.status === 'stable') score += 0.02;
      return { summary, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 0.5) return null;

  const pack = await loadPack(best.summary.id);
  if (!pack) return null;

  const unit = context.unit ? matchUnit(pack, context.unit) : null;
  const topics = unit ? matchTopics(unit, context) : [];
  return { pack, unit, topics, confidence: Math.min(1, best.score) };
}

/**
 * The topics this lesson is about, widened by one on each side.
 *
 * A lesson usually spans two or three consecutive topics, and the neighbours are where the
 * prerequisites and the follow-ons live, so a window reads better than an exact hit. Everything
 * outside the window still appears in the block, as one line each — the model needs to know the
 * rest of the unit exists without being told to teach it.
 *
 * Returns empty when nothing matched, which `buildPackBlock` reads as "use the whole unit".
 */
function matchTopics(unit: PackUnit, context: NoteContext): PackTopic[] {
  const haystack = `${context.topic ?? ''} ${context.unit ?? ''}`.toLowerCase();
  if (!haystack.trim()) return [];

  const hits = new Set<number>();
  unit.topics.forEach((topic, index) => {
    // "1.3", "1.3-1.4" and "topics 1.1 to 1.4" all have to find topic 1.3.
    if (new RegExp(`(^|[^\\d.])${topic.id.replace('.', '\\.')}([^\\d]|$)`).test(haystack))
      hits.add(index);
    else if (haystack.includes(topic.name.toLowerCase())) hits.add(index);
  });
  if (hits.size === 0) return [];

  const widened = new Set<number>();
  for (const index of hits) {
    for (const near of [index - 1, index, index + 1]) {
      if (near >= 0 && near < unit.topics.length) widened.add(near);
    }
  }
  return [...widened]
    .sort((a, b) => a - b)
    .map((index) => unit.topics[index])
    .filter((topic): topic is PackTopic => Boolean(topic));
}

function matchUnit(pack: CurriculumPack, unit: string): PackUnit | null {
  const wanted = unit.toLowerCase();
  const number = /\b(\d+)\b/.exec(wanted)?.[1];
  return (
    pack.units.find((entry) => entry.name.toLowerCase() === wanted) ??
    pack.units.find((entry) => wanted.includes(entry.name.toLowerCase())) ??
    (number
      ? (pack.units.find((entry) => new RegExp(`\\b${number}\\b`).test(entry.id)) ??
        pack.units.find((entry) => new RegExp(`\\b${number}\\b`).test(entry.name)) ??
        null)
      : null)
  );
}

/**
 * The rendered CURRICULUM_PACK_BLOCK: global conventions plus every topic of the matched unit
 * (a "lesson" often spans two or three). Must stay under ~1200 tokens so it caches cheaply.
 */
export interface CurriculumPackBlock {
  packId: string | null;
  unitId: string | null;
  text: string;
  approxTokens: number;
}

/**
 * The rendered CURRICULUM_PACK_BLOCK.
 *
 * It is `user[0]` of the cached prefix, so it must be a pure function of the pack and the matched
 * unit — no clock, no note id, nothing per-call. Two students on the same course and unit get the
 * same bytes, which is what makes DeepSeek bill the second one at the cache-hit rate.
 */
/**
 * The soft budget from 05 §2. It is a goal rather than a guarantee, and the ladder plus the topic
 * window below are how a unit is fitted into it. `pnpm pack:validate` warns above this and fails
 * above HARD_TOKEN_CEILING, because a unit that cannot be rendered compactly is an authoring
 * problem to fix in the pack, not at call time.
 */
const TARGET_TOKENS = 1200;

/**
 * The detail ladder. `buildPackBlock` emits the richest level that fits the budget, dropping the
 * least load-bearing fields first: connections between topics help least, then the visual
 * suggestions, then the worked-example patterns. Scope, definitions, required depth and
 * misconceptions are never dropped — they are the pack.
 */
const DETAIL_LEVELS = [
  { equations: true, connections: true, visuals: true, patterns: true },
  { equations: true, connections: false, visuals: true, patterns: true },
  { equations: false, connections: false, visuals: false, patterns: true },
  { equations: false, connections: false, visuals: false, patterns: false },
] as const;

type DetailLevel = (typeof DETAIL_LEVELS)[number];

function list(label: string, items: readonly string[] | undefined): string[] {
  if (!items || items.length === 0) return [];
  return [`${label}: ${items.join('; ')}`];
}

function renderTopic(topic: PackTopic, detail: DetailLevel): string {
  const codes = topic.objectiveCodes?.length ? ` [${topic.objectiveCodes.join(', ')}]` : '';
  const lines = [
    `#### ${topic.id} ${topic.name}${codes}`,
    `Scope: ${topic.scope}`,
    `Must define: ${topic.mustDefine.join('; ')}`,
    `Required depth: ${topic.requiredDepth}`,
    ...list('Watch for', topic.commonMisconceptions),
  ];
  if (detail.patterns) lines.push(...list('Worked-example patterns', topic.workedExamplePatterns));
  if (detail.visuals) lines.push(...list('Visuals that help', topic.visualsThatHelp));
  if (detail.connections) lines.push(...list('Connects to', topic.connections));
  return lines.join('\n');
}

/** The rest of the unit, one line each: enough to place the lesson, too little to teach from. */
function renderTopicIndex(topics: PackTopic[]): string {
  return topics.map((topic) => `- ${topic.id} ${topic.name} — ${topic.scope}`).join('\n');
}

function renderConventions(pack: CurriculumPack, detail: DetailLevel): string[] {
  const conventions = pack.globalConventions;
  const sections: string[] = [
    `## Curriculum reference — ${pack.displayName}`,
    'This is the syllabus this lesson is taught against. Treat it as the definition of "complete and correct" for this course, and do not exceed its scope.',
    `### Notation and conventions\n- ${conventions.notation.join('\n- ')}`,
  ];

  if (conventions.commandTerms && Object.keys(conventions.commandTerms).length > 0) {
    const terms = Object.entries(conventions.commandTerms).map(
      ([term, meaning]) => `- ${term}: ${meaning}`,
    );
    sections.push(`### Command terms\n${terms.join('\n')}`);
  }
  if (conventions.providedReference?.length) {
    sections.push(`### Provided in the exam\n- ${conventions.providedReference.join('\n- ')}`);
  }
  if (conventions.mustMemorise?.length) {
    sections.push(
      `### The student is expected to have memorised\n- ${conventions.mustMemorise.join('\n- ')}`,
    );
  }
  if (conventions.penalisedShortcuts?.length) {
    sections.push(
      `### Shortcuts this course penalises — correct them wherever the notes use one\n- ${conventions.penalisedShortcuts.join('\n- ')}`,
    );
  }
  if (detail.equations && pack.equationsSheet?.length) {
    sections.push(`### Equations available to the student\n- ${pack.equationsSheet.join('\n- ')}`);
  }
  return sections;
}

function renderBlock(match: PackMatch, detail: DetailLevel): string {
  const { pack, unit } = match;
  const sections = renderConventions(pack, detail);

  if (!unit) {
    sections.push(
      `### No unit matched\nThe student did not confirm which unit of ${pack.displayName} this lesson belongs to. Infer it from the notes and stay inside the conventions above.`,
    );
    return sections.join('\n\n');
  }

  const header = [`### ${unit.name}`];
  if (unit.bigIdeas?.length) header.push(`Big ideas: ${unit.bigIdeas.join('; ')}`);
  header.push(unit.summary);
  header.push(
    'The lesson may cover only some of these topics. Cover what the notes are about, at this depth, and do not import the rest of the unit.',
  );
  sections.push(header.join('\n'));

  const focus = match.topics.length > 0 ? match.topics : unit.topics;
  sections.push(focus.map((topic) => renderTopic(topic, detail)).join('\n\n'));

  const rest = unit.topics.filter((topic) => !focus.includes(topic));
  if (rest.length > 0) {
    sections.push(
      `### Also in this unit — context only, do not teach these unless the notes do\n${renderTopicIndex(rest)}`,
    );
  }

  return sections.join('\n\n');
}

/**
 * The pack block, rendered to fit.
 *
 * Two things fight here. 05 §2 asks for a block under ~1200 tokens; 05 §3 specifies AP Chemistry
 * Unit 1 with eight richly detailed topics, which is roughly twice that on its own. Truncating a
 * syllabus to hit a token target would be the wrong way to resolve it, so instead the block is
 * *topic-scoped*: the topics the lesson is actually about get the full treatment and the rest of
 * the unit appears as a one-line index. A lesson that names no topic still gets the whole unit,
 * trimmed down the detail ladder — larger, and correct.
 *
 * It stays a pure function of (pack, unit, topic window), so two students on the same lesson get
 * byte-identical bytes and the second one is billed at the provider's cache-hit rate.
 */
export function buildPackBlock(match: PackMatch | null): CurriculumPackBlock {
  if (!match) {
    return {
      packId: null,
      unitId: null,
      text: NO_PACK_TEXT,
      approxTokens: approxTokens(NO_PACK_TEXT),
    };
  }

  let text = '';
  for (const detail of DETAIL_LEVELS) {
    text = renderBlock(match, detail);
    if (approxTokens(text) <= TARGET_TOKENS) break;
  }

  return {
    packId: match.pack.id,
    unitId: match.unit?.id ?? null,
    text,
    approxTokens: approxTokens(text),
  };
}

const NO_PACK_TEXT =
  "No external syllabus is available for this course. Infer the lesson's scope from the notes themselves and from the standard treatment of this topic at this level.";

/** §4 — used when there is no pack: infer scope from the notes, do not over-reach. */
export function genericBlock(context: NoteContext): CurriculumPackBlock {
  const level =
    context.curriculum === 'INTERNAL' || context.curriculum === 'UNKNOWN'
      ? 'an advanced high-school honors'
      : context.curriculum.replace(/_/g, ' ');

  const text = [
    '## Curriculum reference — none',
    `No external syllabus is available for this course. Infer the lesson's scope **from the notes themselves** and from the standard treatment of this topic for a student at ${level} level. Match that depth — do not expand a single lesson into a textbook chapter.`,
    'Still: define every term, make every formula three parts, finish every example, fix every error (logged), add the obvious missing pieces a teacher would expect, and add helpful visuals.',
    `Choose structure from the ${context.domainFamily ?? 'generic'} template.`,
  ].join('\n\n');

  return { packId: null, unitId: null, text, approxTokens: approxTokens(text) };
}

/**
 * Structural validation of a pack at runtime.
 *
 * `pack.schema.json` is the contract community authors write against and `pnpm pack:validate` is
 * authoritative — it runs Ajv against the real JSON Schema. Ajv is a devDependency and must not
 * reach a client bundle, so this is a hand-rolled mirror for the runtime: it checks the same
 * required fields and enums, and `tests/unit/pack-schema.test.ts` asserts the two agree.
 */
export function validatePack(input: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const pack = input as Partial<CurriculumPack> | null;

  const required = (
    path: string,
    value: unknown,
    check: (v: unknown) => boolean,
    expected: string,
  ) => {
    if (!check(value)) errors.push(`${path}: expected ${expected}`);
  };
  const isText = (v: unknown) => typeof v === 'string' && v.length > 0;
  const isTextArray = (v: unknown) => Array.isArray(v) && v.length > 0 && v.every(isText);

  if (!pack || typeof pack !== 'object')
    return { ok: false, errors: ['(root): expected an object'] };

  required(
    'id',
    pack.id,
    (v) => typeof v === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v),
    'kebab-case id',
  );
  required(
    'version',
    pack.version,
    (v) => typeof v === 'string' && /^\d{4}\.\d+$/.test(v),
    'a version like 2026.1',
  );
  for (const key of ['subject', 'displayName', 'language', 'authority'] as const) {
    required(key, pack[key], isText, 'a non-empty string');
  }
  required(
    'curriculum',
    pack.curriculum,
    (v) => typeof v === 'string' && CURRICULA.includes(v as (typeof CURRICULA)[number]),
    `one of ${CURRICULA.join(', ')}`,
  );
  required(
    'domainFamily',
    pack.domainFamily,
    (v) => typeof v === 'string' && FAMILIES.includes(v as (typeof FAMILIES)[number]),
    `one of ${FAMILIES.join(', ')}`,
  );
  required(
    'status',
    pack.status,
    (v) => v === 'stable' || v === 'beta' || v === 'draft',
    'stable, beta or draft',
  );
  required(
    'globalConventions.notation',
    pack.globalConventions?.notation,
    isTextArray,
    'a non-empty array of strings',
  );

  if (!Array.isArray(pack.units) || pack.units.length === 0) {
    errors.push('units: expected at least one unit');
    return { ok: errors.length === 0, errors };
  }

  pack.units.forEach((unit, i) => {
    const at = `units[${i}]`;
    required(
      `${at}.id`,
      unit?.id,
      (v) => typeof v === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v),
      'kebab-case id',
    );
    required(`${at}.name`, unit?.name, isText, 'a non-empty string');
    required(`${at}.summary`, unit?.summary, isText, 'a non-empty string');
    if (!Array.isArray(unit?.topics) || unit.topics.length === 0) {
      errors.push(`${at}.topics: expected at least one topic`);
      return;
    }
    unit.topics.forEach((topic, j) => {
      const t = `${at}.topics[${j}]`;
      required(`${t}.id`, topic?.id, isText, 'a non-empty string');
      required(`${t}.name`, topic?.name, isText, 'a non-empty string');
      required(`${t}.scope`, topic?.scope, isText, 'a non-empty string');
      required(`${t}.mustDefine`, topic?.mustDefine, isTextArray, 'a non-empty array of strings');
      required(`${t}.requiredDepth`, topic?.requiredDepth, isText, 'a non-empty string');
    });
  });

  return { ok: errors.length === 0, errors };
}

const CURRICULA = ['AP', 'IB_HL', 'IB_SL', 'A_LEVEL', 'IGCSE', 'INTERNAL', 'GENERAL'] as const;
const FAMILIES = [
  'stem-quantitative',
  'stem-descriptive',
  'history-social',
  'literature-language-arts',
  'language-acquisition',
  'generic',
] as const;
