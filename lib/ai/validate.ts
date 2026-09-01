/**
 * Post-parse validation and in-place repair (04-AI-ENGINE.md §5).
 *
 * Hand-rolled rather than Zod, for three reasons that all point the same way: this module runs in
 * the browser, in Node under vitest and in Deno inside the edge function, and a dependency-free
 * module runs identically in all three without an npm specifier or a bundle cost; the interesting
 * rules here (a formula's units, a correction's inline mark, a dangling sectionId) are not shape
 * checks and Zod would not express them anyway; and the repair path needs to *mutate* the document
 * as it goes, which a parser-combinator style validator makes awkward.
 *
 * The severity split is the contract phase-00 wrote and the edge function acts on:
 *
 *   'error'      — the model can fix this cheaply if asked again, so it triggers the §8 repair
 *                  pass: missing units on a formula, a chart with no axis titles.
 *   'repairable' — nothing to ask for; we fixed what could be fixed and the document is usable.
 *                  A diagram the renderer would refuse is dropped, a dangling flashcard is
 *                  dropped, a missing origin becomes the conservative claim ('ai-added').
 *
 * One asymmetry is deliberate and is a safety decision rather than a tidiness one: a `factCheck`
 * flag pointing at a section that does not exist is **retargeted, never dropped**. Losing a
 * flashcard costs a student nothing; silently losing "double-check this claim" costs them the
 * promise the product is built on (06 §5).
 */
import { lintMermaid, lintSmiles } from './lint.ts';
import { PROMPT_VERSION, SCHEMA_VERSION } from './versions.ts';
import type {
  Block,
  ChartSpec,
  Correction,
  DocumentStats,
  GlossaryEntry,
  NoteDocument,
  OpenQuestion,
  Section,
  ValidationIssue,
  ValidationResult,
} from './schema.ts';

/** Above this share of dropped blocks the document is not repairable, it is broken. */
const MAX_DROPPED_SHARE = 0.4;

/** …but only once enough have been dropped for the share to mean anything. */
const MIN_DROPPED_TO_FAIL = 3;

const BLOCK_TYPES = new Set([
  'paragraph',
  'list',
  'definition',
  'formula',
  'workedExample',
  'diagram',
  'structure',
  'callout',
  'misconception',
  'table',
  'marginNote',
  'figure',
]);

const ORIGINS = new Set(['student', 'ai-clarified', 'ai-added', 'ai-corrected']);

type Mutable = Record<string, unknown>;

function isObject(value: unknown): value is Mutable {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function nonEmpty(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

class Issues {
  readonly list: ValidationIssue[] = [];

  error(path: string, rule: string, message: string): void {
    this.list.push({ path, rule, message, severity: 'error' });
  }

  repaired(path: string, rule: string, message: string): void {
    this.list.push({ path, rule, message, severity: 'repairable' });
  }

  get hasErrors(): boolean {
    return this.list.some((issue) => issue.severity === 'error');
  }
}

/**
 * Every string a block puts on the page, for the rules that need to search a section's text
 * (does a correction have an inline mark? is a student block contradicted?).
 */
export function blockText(block: Block): string {
  switch (block.type) {
    case 'paragraph':
      return block.text;
    case 'list':
      return block.items.join('\n');
    case 'definition':
      return `${block.term}\n${block.definition}`;
    case 'formula':
      return `${block.latex}\n${block.useWhen}`;
    case 'workedExample':
      return [
        block.problem,
        ...block.steps.map((step) => `${step.text} ${step.latex ?? ''}`),
        block.answer,
        block.commonMistake,
        block.studentAttempt?.original ?? '',
      ].join('\n');
    case 'diagram':
      return `${block.caption}\n${block.alt}`;
    case 'structure':
      return `${block.caption}\n${block.alt}`;
    case 'callout':
      return `${block.title ?? ''}\n${block.text}`;
    case 'misconception':
      return `${block.wrong}\n${block.right}`;
    case 'table':
      return [block.caption, ...block.columns.map((c) => c.header), ...block.rows.flat()].join(
        '\n',
      );
    case 'marginNote':
      return block.text;
    case 'figure':
      return `${block.caption}\n${block.alt}`;
    default:
      return '';
  }
}

function validateChart(spec: unknown, path: string, issues: Issues): ChartSpec | null {
  if (!isObject(spec)) {
    issues.repaired(path, 'chart-shape', 'chart spec was not an object; diagram dropped');
    return null;
  }
  const kind = text(spec.kind);
  if (!['bars', 'line', 'steps', 'composition'].includes(kind)) {
    issues.repaired(path, 'chart-kind', `unsupported chart kind '${kind}'; diagram dropped`);
    return null;
  }

  // Conservative default: an unmarked chart is treated as illustrative, never as measured data.
  if (typeof spec.illustrative !== 'boolean') {
    spec.illustrative = true;
    issues.repaired(
      path,
      'chart-illustrative',
      'chart did not say whether its data was illustrative; assumed it was',
    );
  }

  if (kind !== 'composition' && !(nonEmpty(spec.x) && nonEmpty(spec.y))) {
    issues.error(path, 'chart-axes', 'a chart must have both axis titles (06 §1)');
    return spec as unknown as ChartSpec;
  }

  const points = kind === 'bars' ? spec.series : kind === 'composition' ? spec.parts : spec.points;
  if (!Array.isArray(points) || points.length === 0) {
    issues.repaired(path, 'chart-empty', 'chart had no data; diagram dropped');
    return null;
  }

  return spec as unknown as ChartSpec;
}

/** Returns the block, or null when it has to be dropped. Mutates in place where it can repair. */
function validateBlock(raw: unknown, path: string, issues: Issues): Block | null {
  if (!isObject(raw)) {
    issues.repaired(path, 'block-shape', 'block was not an object; dropped');
    return null;
  }
  const type = text(raw.type);
  if (!BLOCK_TYPES.has(type)) {
    issues.repaired(path, 'block-type', `unknown block type '${type}'; dropped`);
    return null;
  }
  if (!ORIGINS.has(text(raw.origin))) {
    raw.origin = 'ai-added';
    issues.repaired(path, 'origin', "block had no provenance; recorded as 'ai-added'");
  }

  switch (type) {
    case 'formula': {
      const where = Array.isArray(raw.where) ? raw.where : [];
      const named = where.filter((v) => isObject(v) && nonEmpty(v.symbol) && nonEmpty(v.units));
      if (named.length === 0) {
        issues.error(
          path,
          'formula-units',
          'every formula needs at least one symbol with units (§5)',
        );
      } else if (named.length !== where.length) {
        issues.error(path, 'formula-units', 'a symbol in this formula has no units');
      }
      if (!nonEmpty(raw.useWhen)) {
        issues.error(path, 'formula-use-when', 'every formula needs a one-line "use this when"');
      }
      if (!nonEmpty(raw.latex)) {
        issues.repaired(path, 'formula-latex', 'formula had no equation; dropped');
        return null;
      }
      break;
    }
    case 'diagram': {
      if (!nonEmpty(raw.caption) || !nonEmpty(raw.alt)) {
        if (nonEmpty(raw.caption) && !nonEmpty(raw.alt)) {
          raw.alt = raw.caption;
          issues.repaired(path, 'diagram-alt', 'diagram had no alt text; used its caption');
        } else {
          issues.repaired(path, 'diagram-caption', 'diagram had no caption or alt text; dropped');
          return null;
        }
      }
      if (raw.engine === 'mermaid') {
        const lint = lintMermaid(text(raw.source));
        if (!lint.ok) {
          issues.repaired(path, 'mermaid', `diagram dropped: ${lint.reason}`);
          return null;
        }
      } else if (raw.engine === 'chart') {
        const spec = validateChart(raw.spec, `${path}.spec`, issues);
        if (!spec) return null;
        raw.spec = spec;
      } else {
        issues.repaired(
          path,
          'diagram-engine',
          `unknown diagram engine '${text(raw.engine)}'; dropped`,
        );
        return null;
      }
      break;
    }
    case 'structure': {
      const lint = lintSmiles(text(raw.smiles));
      if (!lint.ok) {
        issues.repaired(path, 'smiles', `structure dropped: ${lint.reason}`);
        return null;
      }
      if (!nonEmpty(raw.caption) || !nonEmpty(raw.alt)) {
        issues.repaired(path, 'structure-caption', 'structure had no caption or alt text; dropped');
        return null;
      }
      break;
    }
    case 'workedExample': {
      if (!Array.isArray(raw.steps) || raw.steps.length === 0) {
        issues.error(path, 'worked-example-steps', 'a worked example must show its steps');
      }
      if (!nonEmpty(raw.answer)) {
        issues.error(path, 'worked-example-answer', 'a worked example must state its final answer');
      }
      if (!nonEmpty(raw.commonMistake)) {
        raw.commonMistake = '';
        issues.repaired(
          path,
          'worked-example-mistake',
          'worked example had no "common mistake" line',
        );
      }
      break;
    }
    case 'table': {
      const columns = Array.isArray(raw.columns) ? raw.columns.length : 0;
      const rows = Array.isArray(raw.rows) ? (raw.rows as unknown[][]) : [];
      if (columns === 0 || rows.length === 0) {
        issues.repaired(path, 'table-empty', 'table had no columns or no rows; dropped');
        return null;
      }
      const ragged = rows.filter((row) => !Array.isArray(row) || row.length !== columns);
      if (ragged.length > 0) {
        raw.rows = rows
          .filter((row) => Array.isArray(row))
          .map((row) => {
            const cells = row.map((cell) => (typeof cell === 'string' ? cell : String(cell ?? '')));
            return cells.length >= columns
              ? cells.slice(0, columns)
              : [...cells, ...Array(columns - cells.length).fill('')];
          });
        issues.repaired(
          path,
          'table-ragged',
          `${ragged.length} row(s) did not match the columns; padded`,
        );
      }
      break;
    }
    case 'definition': {
      if (!nonEmpty(raw.term) || !nonEmpty(raw.definition)) {
        issues.repaired(path, 'definition-empty', 'definition was incomplete; dropped');
        return null;
      }
      break;
    }
    case 'paragraph': {
      if (!nonEmpty(raw.text)) {
        issues.repaired(path, 'paragraph-empty', 'empty paragraph dropped');
        return null;
      }
      break;
    }
    case 'list': {
      const items = Array.isArray(raw.items) ? raw.items.filter(nonEmpty) : [];
      if (items.length === 0) {
        issues.repaired(path, 'list-empty', 'empty list dropped');
        return null;
      }
      raw.items = items;
      raw.ordered = raw.ordered === true;
      break;
    }
    default:
      break;
  }

  return raw as unknown as Block;
}

export function validateNoteDocument(input: unknown): ValidationResult {
  const issues = new Issues();

  if (!isObject(input)) {
    issues.error('(root)', 'shape', 'the model did not return a JSON object');
    return { ok: false, issues: issues.list };
  }

  const doc = input as Mutable;
  if (!nonEmpty(doc.title)) issues.error('title', 'title', 'the document has no title');
  if (!nonEmpty(doc.summary)) issues.error('summary', 'summary', 'the document has no summary');
  if (!Array.isArray(doc.sections) || doc.sections.length === 0) {
    issues.error('sections', 'sections', 'the document has no sections');
    return { ok: false, issues: issues.list };
  }

  doc.schemaVersion = SCHEMA_VERSION;
  doc.promptVersion = PROMPT_VERSION;
  doc.objectives = Array.isArray(doc.objectives) ? doc.objectives.filter(nonEmpty) : [];
  doc.glossary = Array.isArray(doc.glossary) ? doc.glossary : [];
  doc.corrections = Array.isArray(doc.corrections) ? doc.corrections : [];
  doc.openQuestions = Array.isArray(doc.openQuestions) ? doc.openQuestions : [];

  /* Sections -------------------------------------------------------------- */
  let total = 0;
  let dropped = 0;
  const seenIds = new Set<string>();
  const sections: Section[] = [];

  (doc.sections as unknown[]).forEach((rawSection, index) => {
    const path = `sections[${index}]`;
    if (!isObject(rawSection)) {
      issues.repaired(path, 'section-shape', 'section was not an object; dropped');
      return;
    }
    if (!nonEmpty(rawSection.id)) {
      rawSection.id = `s-${index + 1}`;
      issues.repaired(path, 'section-id', 'section had no id; assigned one');
    }
    let id = text(rawSection.id);
    if (seenIds.has(id)) {
      id = `${id}-${index + 1}`;
      rawSection.id = id;
      issues.repaired(path, 'section-id', 'two sections shared an id; renamed the second');
    }
    seenIds.add(id);
    if (!nonEmpty(rawSection.title)) {
      issues.error(path, 'section-title', 'a section has no heading');
    }
    if (rawSection.level !== 2 && rawSection.level !== 3) rawSection.level = 2;

    const rawBlocks = Array.isArray(rawSection.blocks) ? rawSection.blocks : [];
    const blocks: Block[] = [];
    rawBlocks.forEach((rawBlock, blockIndex) => {
      total += 1;
      const block = validateBlock(rawBlock, `${path}.blocks[${blockIndex}]`, issues);
      if (block) blocks.push(block);
      else dropped += 1;
    });
    rawSection.blocks = blocks;
    sections.push(rawSection as unknown as Section);
  });

  doc.sections = sections;
  if (sections.length === 0) {
    issues.error('sections', 'sections', 'every section was unusable');
    return { ok: false, issues: issues.list };
  }
  // Both conditions, not either: on a four-block document one dropped diagram is 25% and means
  // nothing, while on a forty-block one it is a rounding error. A document is broken rather than
  // repairable when a lot of it is gone *and* that is most of it.
  if (dropped > MIN_DROPPED_TO_FAIL && dropped / total > MAX_DROPPED_SHARE) {
    issues.error(
      'sections',
      'too-much-dropped',
      `${dropped} of ${total} blocks were unusable — the document is broken rather than repairable`,
    );
  }

  const ids = new Set(sections.map((section) => section.id));
  const firstId = sections[0]?.id ?? 's-1';
  const sectionText = new Map(
    sections.map((section) => [section.id, section.blocks.map(blockText).join('\n')]),
  );
  const allText = [...sectionText.values()].join('\n');

  /* Cross-references ------------------------------------------------------ */
  const studyTools = isObject(doc.studyTools) ? doc.studyTools : {};
  for (const key of ['flashcards', 'quiz'] as const) {
    const items = Array.isArray(studyTools[key]) ? (studyTools[key] as Mutable[]) : [];
    const kept = items.filter((item) => isObject(item) && ids.has(text(item.sectionId)));
    if (kept.length !== items.length) {
      issues.repaired(
        `studyTools.${key}`,
        'dangling-section',
        `${items.length - kept.length} item(s) referenced a section that does not exist; dropped`,
      );
    }
    studyTools[key] = kept;
  }
  doc.studyTools = studyTools;

  const factCheck = isObject(doc.factCheck) ? doc.factCheck : {};
  factCheck.calculationsVerified = Array.isArray(factCheck.calculationsVerified)
    ? factCheck.calculationsVerified
    : [];
  const flags = Array.isArray(factCheck.flags) ? (factCheck.flags as Mutable[]) : [];
  for (const flag of flags) {
    if (!ids.has(text(flag.sectionId))) {
      flag.sectionId = firstId;
      issues.repaired(
        'factCheck.flags',
        'dangling-section',
        'a fact-check flag pointed at a section that does not exist; retargeted rather than dropped',
      );
    }
  }
  factCheck.flags = flags;
  if (typeof factCheck.checkedClaims !== 'number') factCheck.checkedClaims = 0;
  doc.factCheck = factCheck;

  for (const key of ['corrections', 'openQuestions'] as const) {
    for (const entry of doc[key] as Mutable[]) {
      if (isObject(entry) && !ids.has(text(entry.sectionId))) {
        entry.sectionId = firstId;
        issues.repaired(
          key,
          'dangling-section',
          `an entry in ${key} pointed at a missing section; retargeted`,
        );
      }
    }
  }

  /* Corrections vs provenance (§5) ---------------------------------------- */
  const correctedBlocks = sections.flatMap((section) =>
    section.blocks.filter((block) => block.origin === 'ai-corrected'),
  );
  for (const [index, correction] of (doc.corrections as Mutable[]).entries()) {
    if (!isObject(correction)) continue;
    const original = text(correction.original);
    if (correctedBlocks.length === 0) {
      issues.repaired(
        `corrections[${index}]`,
        'correction-unmarked',
        'a correction was logged but nothing is marked ai-corrected inline; it still appears in the corrections panel',
      );
    }
    // §5: "no `origin: student` block contains a claim in `corrections`". Read literally that is
    // an error, and it was one here until the hand-authored gold fixture tripped it: a correction
    // whose `original` is a short fragment often *qualifies* the student's wording rather than
    // replacing it, and their sentence rightly survives.
    //
    // So it is a repair rather than a failure, and the repair is the honest label: a block whose
    // text a correction speaks to is `ai-clarified` — their point, with a qualifier added — not
    // untouched `student`. Only substantial quotes count; a handful of words is a fragment, not a
    // claim.
    if (original.length >= 24) {
      for (const section of sections) {
        for (const [blockIndex, block] of section.blocks.entries()) {
          if (block.origin !== 'student' || !blockText(block).includes(original)) continue;
          section.blocks[blockIndex] = { ...block, origin: 'ai-clarified', originalText: original };
          issues.repaired(
            `corrections[${index}]`,
            'student-contradicted',
            "a block was marked as the student's own while a correction spoke to that exact text; re-marked as clarified",
          );
        }
      }
    }
  }

  /* Glossary -------------------------------------------------------------- */
  const glossary = (doc.glossary as Mutable[]).filter(
    (entry) => isObject(entry) && nonEmpty(entry.term) && nonEmpty(entry.definition),
  );
  for (const entry of glossary) {
    if (!ids.has(text(entry.sectionId))) entry.sectionId = firstId;
  }
  doc.glossary = glossary;

  if (Array.isArray(doc.furtherStudy)) doc.furtherStudy = doc.furtherStudy.filter(nonEmpty);

  // Ids are minted here rather than only on the client, so a document leaves the pipeline already
  // addressable: the streaming reveal, the eval harness and the workspace all get the same one.
  const document = assignBlockIds(doc as unknown as NoteDocument);
  document.stats = computeStats(document);

  // `allText` is only needed by the checks above; referencing it keeps the intent obvious to the
  // next reader and costs nothing.
  void allText;

  return { ok: !issues.hasErrors, issues: issues.list, document };
}

/**
 * A single regenerated section (phase-05 §10).
 *
 * `validateNoteDocument` cannot be reused here and should not be made to: half of what it does is
 * whole-document work — cross-referencing flashcards against section ids, checking that every
 * correction has a matching inline mark, deciding whether too much was dropped to be repairable —
 * and a fragment has no document to be checked against. What it *can* share is the part that
 * matters, `validateBlock`, so a formula that arrives without units is caught by the identical
 * rule whether it came from a generation or a re-roll.
 *
 * The section id and level are not validated, because they are not the model's to decide:
 * `replaceSection` re-imposes the ones the document already had. What is validated is that
 * something usable came back at all — a fragment with no blocks left is a failed regenerate, and
 * a failed regenerate must leave the original alone (§5, "regenerate failure keeps the original").
 */
export function validateSectionFragment(input: unknown): SectionFragmentResult {
  const issues = new Issues();

  if (!isObject(input)) {
    issues.error('(root)', 'shape', 'the model did not return a JSON object');
    return { ok: false, issues: issues.list };
  }

  // Tolerated because it is cheap to tolerate and expensive to refuse: a model that returns the
  // section unwrapped has done the hard part right and got the envelope wrong.
  const raw = isObject(input.section) ? input.section : input;

  if (!Array.isArray(raw.blocks)) {
    issues.error('section.blocks', 'sections', 'the fragment has no blocks');
    return { ok: false, issues: issues.list };
  }

  const blocks: Block[] = [];
  let dropped = 0;
  (raw.blocks as unknown[]).forEach((rawBlock, index) => {
    const block = validateBlock(rawBlock, `section.blocks[${index}]`, issues);
    if (block) blocks.push(block);
    else dropped += 1;
  });

  if (blocks.length === 0) {
    issues.error('section.blocks', 'sections', 'every block in the fragment was unusable');
    return { ok: false, issues: issues.list };
  }
  if (dropped > MIN_DROPPED_TO_FAIL && dropped / (dropped + blocks.length) > MAX_DROPPED_SHARE) {
    issues.error(
      'section.blocks',
      'too-much-dropped',
      `${dropped} blocks were unusable — the section is broken rather than repairable`,
    );
  }

  const section: Section = {
    id: text(raw.id),
    title: text(raw.title),
    level: raw.level === 3 ? 3 : 2,
    blocks,
  };

  const envelope = isObject(input.section) ? input : {};
  return {
    ok: !issues.hasErrors,
    issues: issues.list,
    section,
    corrections: listOf<Correction>(envelope.corrections, (entry) => nonEmpty(entry.original)),
    openQuestions: listOf<OpenQuestion>(envelope.openQuestions, (entry) =>
      nonEmpty(entry.question),
    ),
    glossary: listOf<GlossaryEntry>(
      envelope.glossary,
      (entry) => nonEmpty(entry.term) && nonEmpty(entry.definition),
    ),
  };
}

export interface SectionFragmentResult {
  ok: boolean;
  issues: ValidationIssue[];
  section?: Section;
  /** Annotations the model wrote about this section. `sectionId` is re-imposed on apply. */
  corrections?: Correction[];
  openQuestions?: OpenQuestion[];
  glossary?: GlossaryEntry[];
}

function listOf<T>(value: unknown, keep: (entry: Mutable) => boolean): T[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => isObject(entry) && keep(entry)) as T[];
}

/**
 * Last resort before showing the student an error (§8 step 4).
 *
 * Turns whatever error-level issues survived the repair pass into something renderable: drops the
 * blocks that cannot be fixed and records what was dropped as an open question, so the note is
 * honest about being incomplete rather than quietly thin.
 */
export function degradeDocument(document: NoteDocument, issues: ValidationIssue[]): NoteDocument {
  const errors = issues.filter((issue) => issue.severity === 'error');
  if (errors.length === 0) return document;

  const paths = new Set(
    errors
      .map((issue) => /^sections\[\d+\]\.blocks\[\d+\]/.exec(issue.path)?.[0])
      .filter((path): path is string => Boolean(path)),
  );

  const sections = document.sections.map((section, sectionIndex) => ({
    ...section,
    blocks: section.blocks.filter(
      (_, blockIndex) => !paths.has(`sections[${sectionIndex}].blocks[${blockIndex}]`),
    ),
  }));

  const degraded: NoteDocument = {
    ...document,
    sections,
    openQuestions: [
      ...document.openQuestions,
      ...(paths.size > 0
        ? [
            {
              sectionId: sections[0]?.id ?? 's-1',
              question:
                'Some parts of this lesson did not come back complete. Which ones are missing from your notes?',
              why: `We dropped ${paths.size} block(s) we could not verify rather than show you something we were unsure of. Regenerating usually fixes it.`,
            },
          ]
        : []),
    ],
  };
  degraded.stats = computeStats(degraded);
  return degraded;
}

/**
 * Gives every block a stable id, leaving the ones that have one alone (schema 1.1.0).
 *
 * Lives here rather than in `lib/notes/` because the migration below needs it and this module is
 * the one both Next and the Deno edge runtime can import. Idempotent, and it has to be: it runs on
 * every load, after every regeneration and after every insert, and a version that renumbered each
 * pass would invalidate every saved reference in a document nobody had touched.
 *
 * Collisions are resolved rather than assumed away — a regenerated section arrives with ids minted
 * in a different pass, and a restored version can carry ids a later edit also handed out.
 */
export function assignBlockIds(doc: NoteDocument): NoteDocument {
  const taken = new Set<string>();
  for (const section of doc.sections) {
    for (const block of section.blocks) {
      if (block.id && !taken.has(block.id)) taken.add(block.id);
    }
  }

  let changed = false;
  const sections = doc.sections.map((section) => {
    let next = 0;
    const blocks = section.blocks.map((block) => {
      if (block.id && taken.has(block.id)) return block;
      let candidate = `${section.id}-b${next++}`;
      while (taken.has(candidate)) candidate = `${section.id}-b${next++}`;
      taken.add(candidate);
      changed = true;
      return { ...block, id: candidate };
    });
    return changed ? { ...section, blocks } : section;
  });

  return changed ? { ...doc, sections } : doc;
}

/**
 * Upgrades a document written under an older SCHEMA_VERSION so the current renderer can draw it.
 *
 * A switch on the stored version now, rather than the single version stamp it was through 1.0.0.
 * Every step is additive and runs in order, so a document generated in phase-04 and opened in the
 * workspace today walks 1.0.0 → 1.1.0 and comes out with block ids it was never generated with.
 */
export function migrateNoteDocument(doc: NoteDocument): NoteDocument {
  let migrated: NoteDocument = doc;

  // 1.0.0 → 1.1.0: `furtherStudy` and per-block ids. Both optional in the type, because a document
  // fresh from the model has neither; by the time anything renders one, this has run.
  if (!migrated.furtherStudy) migrated = { ...migrated, furtherStudy: [] };
  migrated = assignBlockIds(migrated);

  if (migrated.schemaVersion !== SCHEMA_VERSION) {
    migrated = { ...migrated, schemaVersion: SCHEMA_VERSION };
  }
  if (migrated === doc) return doc;

  return { ...migrated, stats: computeStats(migrated) };
}

/** Recomputes `stats` from the blocks. Cheap; call after any edit. */
export function computeStats(doc: NoteDocument): DocumentStats {
  let aiAdded = 0;
  let aiCorrected = 0;
  for (const section of doc.sections) {
    for (const block of section.blocks) {
      if (block.origin === 'ai-added') aiAdded += 1;
      if (block.origin === 'ai-corrected') aiCorrected += 1;
    }
  }
  return { aiAdded, aiCorrected, openQuestions: doc.openQuestions.length };
}
