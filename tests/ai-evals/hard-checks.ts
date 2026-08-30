/**
 * The hard checks (04-AI-ENGINE.md §9) — the part of the release gate that is not a judgement.
 *
 * Everything here is mechanical and must pass on every fixture, in CI against a recorded response
 * and nightly against the live model. They encode the rubric's absolutes: a formula is three parts
 * or it is a defect; a correction that is not marked inline is a silent change; a quotation that is
 * not in the student's notes is a fabrication.
 *
 * The fabrication check is the one worth reading twice. It pulls every quoted string out of the
 * finished document and requires each to appear in the raw notes, because "never invent a
 * quotation" is the promise the literature and history templates are built on and the one a model
 * breaks most plausibly.
 */
import { validateNoteDocument } from '@/lib/ai/validate';
import { blockText } from '@/lib/ai/validate';
import type { Block, NoteDocument, Section } from '@/lib/ai/schema';

export interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
}

export function ok(name: string): CheckResult {
  return { name, ok: true };
}

export function fail(name: string, detail: string): CheckResult {
  return { name, ok: false, detail };
}

export function check(name: string, condition: boolean, detail = ''): CheckResult {
  return condition ? ok(name) : fail(name, detail);
}

export function allBlocks(doc: NoteDocument): { section: Section; block: Block }[] {
  return doc.sections.flatMap((section) => section.blocks.map((block) => ({ section, block })));
}

/** Every string the document renders, for the checks that search the whole note. */
export function documentText(doc: NoteDocument): string {
  return [
    doc.title,
    doc.summary,
    ...doc.objectives,
    ...doc.sections.map((section) => section.title),
    ...allBlocks(doc).map(({ block }) => blockText(block)),
    ...doc.corrections.flatMap((c) => [c.original, c.corrected, c.why]),
    ...doc.openQuestions.flatMap((q) => [q.question, q.why]),
    ...doc.glossary.flatMap((g) => [g.term, g.definition]),
    ...doc.studyTools.flashcards.flatMap((f) => [f.front, f.back]),
    ...doc.studyTools.quiz.flatMap((q) => [
      q.prompt,
      q.answer,
      q.explanation,
      ...(q.choices ?? []),
    ]),
  ].join('\n');
}

/** Straight and curly double quotes, and Chinese 「」『』, of at least four words. */
const QUOTE_PATTERNS = [/"([^"\n]{12,240})"/g, /“([^”\n]{12,240})”/g];

export function quotedStrings(doc: NoteDocument): string[] {
  const text = documentText(doc);
  const found: string[] = [];
  for (const pattern of QUOTE_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const quote = match[1]?.trim();
      if (quote && quote.split(/\s+/).length >= 4) found.push(quote);
    }
  }
  return found;
}

/** Normalised for comparison: quotation marks, apostrophes and whitespace all vary in transit. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\p{L}\p{N}'"]+/gu, ' ')
    .trim();
}

/** Looks like a citation or a source reference: the shapes a model invents most readily. */
const CITATION_SHAPES = [
  /\(\s*[A-Z][a-z]+(?:\s+(?:and|&)\s+[A-Z][a-z]+)?\s*,\s*(?:19|20)\d{2}[a-z]?\s*(?:,\s*p+\.\s*\d+)?\s*\)/,
  /\b(?:ibid|op\.\s*cit|et al\.)\b/i,
  /\bp+\.\s*\d{1,4}\b/,
  /\bdoi:\s*10\./i,
  /\bhttps?:\/\//i,
];

export function universalChecks(doc: NoteDocument, raw: string): CheckResult[] {
  const results: CheckResult[] = [];

  /* Schema and the §5 post-parse rules ------------------------------------ */
  const validation = validateNoteDocument(JSON.parse(JSON.stringify(doc)));
  const errors = validation.issues.filter((issue) => issue.severity === 'error');
  results.push(
    check(
      'schema-valid',
      errors.length === 0,
      errors.map((issue) => `${issue.path}: ${issue.message}`).join('; '),
    ),
  );

  /* Rubric item 2: every formula is three parts --------------------------- */
  const formulas = allBlocks(doc).filter(({ block }) => block.type === 'formula');
  const broken = formulas.filter(({ block }) => {
    if (block.type !== 'formula') return false;
    return (
      !block.latex.trim() ||
      !block.useWhen.trim() ||
      block.where.length === 0 ||
      block.where.some((variable) => !variable.symbol.trim() || !variable.units.trim())
    );
  });
  results.push(
    check(
      'formulas-are-three-part',
      broken.length === 0,
      `${broken.length} of ${formulas.length} formula block(s) are missing an equation, a symbol's units, or a "use this when"`,
    ),
  );

  /* Rubric item 7: no silent changes -------------------------------------- */
  const marked = allBlocks(doc).some(({ block }) => block.origin === 'ai-corrected');
  results.push(
    check(
      'corrections-are-marked-inline',
      doc.corrections.length === 0 || marked,
      `${doc.corrections.length} correction(s) logged with nothing marked ai-corrected in the text`,
    ),
  );

  /* Rubric item 9: no fabrication ----------------------------------------- */
  const haystack = normalise(raw);
  const invented = quotedStrings(doc).filter((quote) => !haystack.includes(normalise(quote)));
  results.push(
    check(
      'no-invented-quotations',
      invented.length === 0,
      invented.map((quote) => `"${quote.slice(0, 60)}…"`).join(' / '),
    ),
  );

  const text = documentText(doc);
  const citations = CITATION_SHAPES.filter((pattern) => pattern.test(text));
  results.push(
    check('no-invented-citations', citations.length === 0, citations.map(String).join(' ')),
  );

  /* Provenance is present and meaningful ---------------------------------- */
  const origins = new Set(allBlocks(doc).map(({ block }) => block.origin));
  results.push(
    check(
      'provenance-is-mixed',
      origins.size >= 2,
      `every block claims the same origin (${[...origins].join(', ')})`,
    ),
  );

  /* Every visual is captioned and described ------------------------------- */
  const visuals = allBlocks(doc).filter(
    ({ block }) => block.type === 'diagram' || block.type === 'structure',
  );
  const undescribed = visuals.filter(({ block }) => {
    if (block.type !== 'diagram' && block.type !== 'structure') return false;
    return !block.caption.trim() || !block.alt.trim();
  });
  results.push(
    check(
      'visuals-are-described',
      undescribed.length === 0,
      `${undescribed.length} without caption or alt`,
    ),
  );

  return results;
}

/** Rubric "Study tools": 8–16 flashcards and 6–10 quiz items, from the finished content. */
export function studyToolChecks(doc: NoteDocument): CheckResult[] {
  const { flashcards, quiz } = doc.studyTools;
  const ids = new Set(doc.sections.map((section) => section.id));
  return [
    check(
      'flashcards-8-to-16',
      flashcards.length >= 8 && flashcards.length <= 16,
      `${flashcards.length}`,
    ),
    check('quiz-6-to-10', quiz.length >= 6 && quiz.length <= 10, `${quiz.length}`),
    check(
      'study-tools-point-at-real-sections',
      [...flashcards, ...quiz].every((item) => ids.has(item.sectionId)),
      'a flashcard or quiz item references a section that does not exist',
    ),
    check(
      'quiz-explains-itself',
      quiz.every((item) => item.explanation.trim().length > 0),
      'a quiz item has no explanation',
    ),
  ];
}
