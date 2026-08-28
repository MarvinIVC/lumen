import type {
  Block,
  CalloutKind,
  ChartSpec,
  Correction,
  Flashcard,
  FormulaVariable,
  GlossaryEntry,
  NoteDocument,
  OpenQuestion,
  QuizItem,
  Section,
  TableBlock,
  WorkedExampleBlock,
  WorkedExampleStep,
} from '@/lib/ai/schema';
import { PROMPT_VERSION, SCHEMA_VERSION } from '@/lib/ai/schema';

import { readAnnotations, stripAnnotations } from './annotations';

/**
 * A dev-only adapter: `fixtures/ap-chem-u1-gold.md` → `NoteDocument`.
 *
 * The gold fixture is hand-authored markdown, written as the North Star for what good output
 * looks like. The real pipeline (phase-04) emits the JSON directly and this file will never run
 * in production — it exists so the renderer has genuinely good content to be judged against
 * before there is a model behind it.
 *
 * It is therefore deliberately narrow: it understands the conventions *this* document uses, not
 * markdown in general. When it meets something it does not recognise it falls back to a
 * paragraph, which is the right failure for a fixture loader.
 */

const SPECIAL_SECTIONS = new Set([
  'corrections',
  'open questions',
  'glossary',
  'study next',
  'flashcards',
  'quick quiz',
]);

export function parseGoldFixture(markdown: string): NoteDocument {
  const lines = markdown.replace(/<!--[\s\S]*?-->/g, '').split('\n');

  const doc: NoteDocument = {
    schemaVersion: SCHEMA_VERSION,
    promptVersion: PROMPT_VERSION,
    title: '',
    context: {
      subject: 'Chemistry',
      curriculum: 'AP',
      course: 'AP Chemistry',
      unit: 'Unit 1 (Topics 1.1–1.4)',
      topic: 'Atomic structure, the mole, isotopes and formulas',
      language: 'en',
      packId: 'ap-chemistry',
      domainFamily: 'stem-quantitative',
    },
    options: { mode: 'study_guide', depth: 'thorough', visuals: 'auto', voice: 'keep-mine' },
    summary: '',
    objectives: [],
    sections: [],
    corrections: [],
    openQuestions: [],
    factCheck: { calculationsVerified: [], checkedClaims: 0, flags: [], verdict: 'minor-fixes' },
    studyTools: { flashcards: [], quiz: [] },
    glossary: [],
    furtherStudy: [],
  };

  const chunks = splitByHeading(lines);

  for (const chunk of chunks) {
    if (chunk.level === 1) {
      doc.title = chunk.title;
      readFrontMatter(chunk.body, doc);
      continue;
    }

    const key = chunk.title.toLowerCase().replace(/\s+/g, ' ');
    if (chunk.level === 2 && [...SPECIAL_SECTIONS].some((name) => key.startsWith(name))) {
      readSpecialSection(key, chunk.body, doc);
      continue;
    }

    const section = buildSection(chunk, doc.sections.length);
    if (section.blocks.length) doc.sections.push(section);
  }

  assignSectionIds(doc);
  linkCorrectionsToExamples(doc);
  addStructureForNamedCompound(doc);
  flagIllustrativeFigures(doc);
  doc.stats = {
    aiAdded: countOrigin(doc, 'ai-added'),
    aiCorrected: countOrigin(doc, 'ai-corrected'),
    openQuestions: doc.openQuestions.length,
  };

  return doc;
}

/* -------------------------------------------------------------------------- *
 * Structure
 * -------------------------------------------------------------------------- */

interface Chunk {
  level: 1 | 2 | 3;
  title: string;
  body: string[];
}

function splitByHeading(lines: string[]): Chunk[] {
  const chunks: Chunk[] = [];
  let current: Chunk | null = null;

  for (const line of lines) {
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      if (current) chunks.push(current);
      current = {
        level: heading[1]!.length as 1 | 2 | 3,
        title: stripAnnotations(heading[2]!.replace(/\*\*/g, '')),
        body: [],
      };
      continue;
    }
    current?.body.push(line);
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Title block: the course line, "In one paragraph", and the objectives list. */
function readFrontMatter(body: string[], doc: NoteDocument): void {
  const text = body.join('\n');

  const summary = /\*\*In one paragraph\.\*\*\s*([\s\S]*?)\n\n/.exec(text);
  if (summary) doc.summary = tidy(summary[1]!);

  const objectives = /\*\*By the end you can:\*\*\s*\n([\s\S]*?)(?:\n\n|\n---)/.exec(text);
  if (objectives) {
    doc.objectives = objectives[1]!
      .split('\n')
      .filter((line) => line.trim().startsWith('- '))
      .map((line) => tidy(line.trim().slice(2)));
  }
}

function buildSection(chunk: Chunk, index: number): Section {
  const title = chunk.title;
  const id = slug(title, index);

  if (/^worked example/i.test(title)) {
    const example = parseWorkedExample(chunk.body, chunk.title);
    return { id, title, level: 3, blocks: example ? [example] : [] };
  }

  return {
    id,
    title,
    level: chunk.level === 2 ? 2 : 3,
    blocks: parseBlocks(chunk.body),
  };
}

/* -------------------------------------------------------------------------- *
 * Blocks
 * -------------------------------------------------------------------------- */

function parseBlocks(body: string[]): Block[] {
  const blocks: Block[] = [];
  let index = 0;

  while (index < body.length) {
    const line = body[index]!;
    const trimmed = line.trim();

    if (!trimmed || trimmed === '---') {
      index += 1;
      continue;
    }

    if (trimmed.startsWith('>')) {
      // Every line of a blockquote in this fixture carries its own '>', so a blank line is a
      // boundary between two of them — §1.1 is two formulas and a margin note back to back.
      const [quote, next] = takeWhile(body, index, (l) => l.trim().startsWith('>'));
      index = next;
      const block = parseBlockquote(quote);
      if (block) blocks.push(block);
      continue;
    }

    if (trimmed.startsWith('|')) {
      const [rows, next] = takeWhile(body, index, (l) => l.trim().startsWith('|'));
      index = next;
      const table = parseTable(rows);
      if (table) blocks.push(table);
      continue;
    }

    if (/^[-*]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
      const ordered = /^\d+\.\s/.test(trimmed);
      const [items, next] = takeListItems(body, index, ordered);
      index = next;
      const annotated = items.map((item) => readAnnotations(item));
      blocks.push({
        type: 'list',
        ordered,
        items: annotated.map((item) => item.text),
        origin: annotated.find((item) => item.origin !== 'student')?.origin ?? 'student',
      });
      continue;
    }

    const [paragraph, next] = takeWhile(
      body,
      index,
      (l) => l.trim() !== '' && !/^[|>#-]/.test(l.trim()) && !/^\d+\.\s/.test(l.trim()),
    );
    index = next;
    const block = parseParagraph(paragraph.join(' '));
    if (block) blocks.push(block);
  }

  return blocks;
}

/**
 * A paragraph, unless it is one of the shapes the fixture uses for something richer: a lone `$$`
 * display equation, or a bolded lead-in that is really a key term.
 */
function parseParagraph(raw: string): Block | null {
  const { text, origin } = readAnnotations(raw);
  if (!text) return null;

  const display = /^\$\$([\s\S]+)\$\$$/.exec(text.trim());
  if (display) {
    return { type: 'formula', latex: display[1]!.trim(), where: [], useWhen: '', origin };
  }

  // "**Term** — definition" and "**Term.** definition" are the fixture's key-term shapes.
  const definition = /^\*\*([^*]{2,60})\*\*\s*(?:—|--|\.)\s*(.+)$/.exec(text);
  if (definition && definition[2]!.length > 40 && !definition[1]!.includes('$')) {
    return {
      type: 'definition',
      term: definition[1]!.replace(/[.:]$/, '').trim(),
      definition: tidy(definition[2]!),
      origin,
    };
  }

  return { type: 'paragraph', text: tidy(text), origin };
}

/**
 * Blockquotes carry most of the fixture's designed objects: formulas with their `where:` list,
 * margin notes, figures with a fenced chart or mermaid spec, and callouts.
 */
function parseBlockquote(lines: string[]): Block | null {
  const inner = lines
    .map((line) => line.replace(/^\s*>\s?/, ''))
    .join('\n')
    .trim();
  if (!inner) return null;

  const { text, origin } = readAnnotations(inner);
  const first = text.split('\n')[0] ?? '';

  if (/^\*\*Formula\b/i.test(first)) return parseFormula(text, origin);
  if (/^\*\*Margin note\b/i.test(first)) return parseMarginNote(text, origin);
  if (/^\*\*Figure\b/i.test(first) || text.includes('```chart')) return parseFigure(text, origin);
  if (text.includes('```mermaid')) return parseMermaid(text, origin);

  return parseCallout(text, origin);
}

function parseFormula(text: string, origin: Block['origin']): Block {
  const title = /^\*\*Formula\s*[—-]\s*([^*]+)\*\*/i.exec(text);
  const latex = /\$\$([\s\S]+?)\$\$/.exec(text);
  const useWhen = /\*\*Use when:\*\*\s*([\s\S]*?)(?:\n\n|$)/i.exec(text);

  return {
    type: 'formula',
    latex: latex ? latex[1]!.trim() : '',
    where: parseWhere(text),
    useWhen: useWhen ? tidy(useWhen[1]!) : '',
    ...(title ? { number: undefined } : {}),
    origin,
  };
}

/**
 * The fixture writes the variable list as prose — "where $n$ = amount (mol), $m$ = mass (g)" —
 * so the units come out of the parentheses. Every formula needs units (rubric item 2), and
 * "not stated" is a visible gap rather than a silent empty string.
 */
function parseWhere(text: string): FormulaVariable[] {
  const line =
    /(?:^|\n)\s*(?:where\s+)?((?:\$[^$]+\$\s*=\s*[^,\n]+)(?:,\s*\$[^$]+\$\s*=\s*[^,\n]+)*)/i.exec(
      text.replace(/\*\*/g, ''),
    );
  if (!line) return [];

  return line[1]!
    .split(/,\s*(?=\$)/)
    .map((entry) => {
      const parsed = /\$([^$]+)\$\s*=\s*(.+)/.exec(entry.trim());
      if (!parsed) return null;
      const meaning = parsed[2]!.trim().replace(/[.]$/, '');
      const units = /\(([^)]+)\)\s*$/.exec(meaning);
      const bare = units ? meaning.slice(0, units.index).trim() : meaning;
      return {
        symbol: parsed[1]!.trim(),
        meaning: bare,
        // A count has no unit, and saying so is more useful than "not stated" — which should be
        // reserved for a genuine gap the student can go and fill.
        units: units
          ? units[1]!.trim()
          : /^(?:number|count) of\b/i.test(bare)
            ? 'dimensionless'
            : 'not stated',
      } satisfies FormulaVariable;
    })
    .filter((entry): entry is FormulaVariable => entry !== null);
}

function parseMarginNote(text: string, origin: Block['origin']): Block {
  const header = /^\*\*Margin note\s*·\s*([^*]+)\*\*/i.exec(text);
  const label = (header?.[1] ?? '').toLowerCase();
  const kind = label.includes('mnemonic')
    ? 'mnemonic'
    : label.includes('exam')
      ? 'exam-tip'
      : label.includes('why')
        ? 'why-it-matters'
        : 'connection';

  const body = text.replace(/^\*\*Margin note[^*]*\*\*\s*/i, '').trim();

  // A margin note containing a fenced diagram is really a figure that happens to sit in the
  // margin; the fixture's "master diagram" is one. Render it as a diagram so it gets drawn.
  if (body.includes('```mermaid')) {
    return parseMermaid(body, origin, tidy(header?.[1] ?? ''));
  }

  return { type: 'marginNote', kind, text: tidy(body), origin };
}

function parseFigure(text: string, origin: Block['origin']): Block {
  const header = /^\*\*Figure\s*[\d.]*\s*[—-]?\s*([^*]*)\*\*/i.exec(text);
  const chart = /```chart\n([\s\S]*?)```/.exec(text);
  const trailing = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^\*\*Figure[^*]*\*\*/i, '')
    .trim();

  const caption = asSentence(tidy(header?.[1] ?? trailing.split('\n')[0] ?? 'Figure'));

  if (chart) {
    const spec = parseChartSpec(chart[1]!);
    if (spec) {
      return {
        type: 'diagram',
        engine: 'chart',
        spec,
        caption,
        alt: describeChart(spec, caption),
        origin,
      };
    }
  }

  return { type: 'paragraph', text: tidy(text.replace(/```[\s\S]*?```/g, '')), origin };
}

function parseMermaid(text: string, origin: Block['origin'], heading = ''): Block {
  const fence = /```mermaid\n([\s\S]*?)```/.exec(text);

  // Every prose line before the fence is one sentence wrapped across the source; joining them is
  // the difference between a caption and a caption cut off mid-clause.
  const prose = tidy(
    text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/\*\*[^*]*\*\*/g, '')
      .replace(/:\s*$/, '.'),
  );
  const caption = asSentence(
    [capitalise(heading), prose].filter(Boolean).join('. ').replace(/\.\.+/g, '.'),
  );

  return {
    type: 'diagram',
    engine: 'mermaid',
    source: fence ? fence[1]!.trim() : '',
    caption: caption || 'Process diagram',
    alt: caption || 'Process diagram',
    origin,
  };
}

function capitalise(input: string): string {
  return input ? input.charAt(0).toUpperCase() + input.slice(1) : '';
}

/**
 * Captions are printed after "Figure 3." so they have to stand as sentences. The fixture writes
 * them as fragments in a heading — "model mass spectrum of chlorine" — which reads as a mistake
 * once it follows a full stop.
 */
function asSentence(input: string): string {
  const text = capitalise(input.trim());
  return text && !/[.!?)\]]$/.test(text) ? `${text}.` : text;
}

/**
 * The fixture's chart fences are a small YAML-ish dialect (06 §1 shows the same shape). Only the
 * `bars` kind appears in the gold file; the others are supported so a hand-written story can
 * exercise them without a second parser.
 */
function parseChartSpec(source: string): ChartSpec | null {
  const value = (key: string) =>
    new RegExp(`^${key}:\\s*"?([^"\\n]+)"?\\s*$`, 'm').exec(source)?.[1]?.trim();

  const kind = value('kind');
  const illustrative = /illustrative/i.test(source);

  if (kind === 'bars') {
    const series = [
      ...source.matchAll(/-\s*\{\s*label:\s*"([^"]+)"\s*,\s*value:\s*([\d.]+)\s*\}/g),
    ].map((match) => ({ label: match[1]!, value: Number(match[2]) }));
    if (!series.length) return null;
    const note = value('note');
    return {
      kind: 'bars',
      x: value('x') ?? '',
      y: value('y') ?? '',
      series,
      ...(note ? { note } : {}),
      illustrative,
    };
  }

  return null;
}

function describeChart(spec: ChartSpec, caption: string): string {
  if (spec.kind === 'bars') {
    const peaks = spec.series.map((entry) => `${entry.label} at ${entry.value}`).join(', ');
    return `${caption}. Bar chart of ${spec.y} against ${spec.x}: ${peaks}.`;
  }
  return caption;
}

const CALLOUT_HINTS: [RegExp, CalloutKind][] = [
  [/\b(law|definition|defined as)\b/i, 'definition'],
  [/\b(common mistake|watch out|careful|do not|don't)\b/i, 'warning'],
  [/\b(example|e\.g\.)\b/i, 'example'],
];

function parseCallout(text: string, origin: Block['origin']): Block {
  const header = /^\*\*([^*]+)\*\*/.exec(text);
  const title = header ? tidy(header[1]!.replace(/[.:]$/, '')) : undefined;
  const body = tidy(header ? text.slice(header[0].length) : text);

  const kind = CALLOUT_HINTS.find(([pattern]) => pattern.test(title ?? body))?.[1] ?? 'tip';

  return { type: 'callout', kind, ...(title ? { title } : {}), text: body, origin };
}

function parseTable(rows: string[]): TableBlock | null {
  const cells = rows.map((row) =>
    row
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim()),
  );
  if (cells.length < 2) return null;

  const [header, divider, ...body] = cells;
  if (!header || !divider || !/^[-:\s]+$/.test(divider.join(''))) return null;

  return {
    type: 'table',
    caption: '',
    columns: header.map((text, index) => ({
      header: stripAnnotations(text.replace(/\*\*/g, '')),
      // A column is numeric when most of its cells are; that is more reliable than the alignment
      // markers, which the fixture does not use.
      numeric: body.filter((row) => isNumeric(row[index] ?? '')).length > body.length / 2,
    })),
    rows: body.map((row) => row.map((cell) => stripAnnotations(cell))),
    origin: rows.some((row) => /ai-corrected/i.test(row)) ? 'ai-corrected' : 'student',
  };
}

function isNumeric(cell: string): boolean {
  return /^[\d\s.,×^+-]*\d/.test(cell.replace(/\$[^$]*\$/g, '').trim()) && cell.trim().length > 0;
}

/* -------------------------------------------------------------------------- *
 * Worked examples
 * -------------------------------------------------------------------------- */

function parseWorkedExample(body: string[], heading: string): WorkedExampleBlock | null {
  // The answer note and the common mistake live in a trailing blockquote; leaving the '>' markers
  // in would drag them into the middle of the captured sentence.
  const text = body.map((line) => line.replace(/^\s*>\s?/, '')).join('\n');
  const { origin } = readAnnotations(heading);

  const problem = /\*\*Problem\.\*\*\s*([\s\S]*?)(?:\n\n|\*\*Solution)/.exec(text);
  if (!problem) return null;

  const steps: WorkedExampleStep[] = [];
  const stepBlock = /\*\*Solution\.\*\*\s*([\s\S]*?)(?:\n\$\$|\n>|$)/.exec(text);
  const stepSource = stepBlock ? stepBlock[1]! : text;

  for (const line of stepSource.split('\n')) {
    const numbered = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (!numbered) continue;
    const content = numbered[1]!;
    // A step's trailing display maths is pulled onto its own line, per 03-DESIGN.md §6.
    const inlineMath = /^(.*?):?\s*(\$[^$]+\$)\s*\.?$/.exec(content);
    steps.push(
      inlineMath && inlineMath[1]!.trim().length > 8
        ? { text: tidy(inlineMath[1]!), latex: inlineMath[2]!.replace(/^\$|\$$/g, '') }
        : { text: tidy(content) },
    );
  }

  // The answer is whatever is boxed — usually a display equation of its own, but sometimes boxed
  // inline at the end of the last step. Both are the answer; only the display form was being
  // found, which left the answer box on screen and empty.
  const boxed =
    /\$\$\\boxed\{([\s\S]*?)\}\$\$/.exec(text) ??
    /\\boxed\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/.exec(text);
  const mistake = /\*\*Common mistake:?\*\*\s*([\s\S]*?)(?:\n\n|$)/.exec(text);

  // Un-box it where it appeared in a step, so the value is not printed twice.
  for (const step of steps) {
    if (step.latex) step.latex = step.latex.replace(/\\boxed\{([\s\S]*?)\}/, '$1');
  }

  return {
    type: 'workedExample',
    problem: tidy(stripAnnotations(problem[1]!)),
    steps,
    answer: boxed ? stripMath(boxed[1]!) : '',
    ...(boxed ? { answerLatex: boxed[1]!.trim() } : {}),
    commonMistake: mistake ? tidy(stripAnnotations(mistake[1]!)) : '',
    origin,
  };
}

/**
 * Ties a correction to the worked example it is about, which is what puts the student's own line
 * struck through above the solution (03-DESIGN.md §6). The link is by content: if the corrected
 * value is the example's answer, the correction is about that example.
 */
function linkCorrectionsToExamples(doc: NoteDocument): void {
  for (const section of doc.sections) {
    for (const block of section.blocks) {
      if (block.type !== 'workedExample' || block.studentAttempt) continue;

      const answer = normaliseMath(block.answerLatex ?? block.answer);
      const match = doc.corrections.find((correction) => {
        // The corrected value is written as maths inside a sentence ("$1.31\\times10^{24}$ (3
        // s.f. …)"), so compare the maths rather than the prose around it.
        const maths = /\$([^$]+)\$/.exec(correction.corrected)?.[1];
        if (!maths) return false;
        const target = normaliseMath(maths);
        return target.length > 4 && answer.includes(target);
      });

      if (match) {
        // The fixture only spells out "why it matters" for one correction; for the rest the
        // corrected statement is the most useful thing to show under the struck-through line.
        block.studentAttempt = { original: match.original, issue: match.why || match.corrected };
        block.origin = 'ai-corrected';
      }
    }
  }
}

function normaliseMath(input: string): string {
  return input.replace(/[\s$\\]/g, '').toLowerCase();
}

/* -------------------------------------------------------------------------- *
 * Appendices
 * -------------------------------------------------------------------------- */

function readSpecialSection(key: string, body: string[], doc: NoteDocument): void {
  const text = body.join('\n').trim();

  if (key.startsWith('corrections')) doc.corrections = parseCorrections(body);
  else if (key.startsWith('open questions')) doc.openQuestions = parseOpenQuestions(body);
  else if (key.startsWith('glossary')) doc.glossary = parseGlossary(text);
  else if (key.startsWith('study next')) doc.furtherStudy = bulletList(body);
  else if (key.startsWith('flashcards')) doc.studyTools.flashcards = parseFlashcards(body);
  else if (key.startsWith('quick quiz')) doc.studyTools.quiz = parseQuiz(body);
}

function parseCorrections(body: string[]): Correction[] {
  return numberedItems(body).map((item) => {
    const clean = dropSeverity(item.replace(/^\d+\.\s*/, ''));
    const why = /\*Why it matters:\*\s*([\s\S]*?)(?:\*\(|$)/.exec(clean);
    const body_ = clean.replace(/\*Why it matters:\*[\s\S]*/, '');

    // Most items are "**\"what you wrote\"** → the fix". A few just state the fix after the quoted
    // phrase, with no arrow — so the quote is the original and whatever follows is the correction.
    const [before, after] = body_.includes('→')
      ? splitOnce(body_, '→')
      : splitOnce(body_.replace(/^\*\*([^*]+)\*\*/, '**$1**\u0000'), '\u0000');

    return {
      sectionId: '',
      original: tidy(stripQuotes(before ?? body_)),
      corrected: tidy(stripQuotes(after ?? '')),
      // Only the first correction in the fixture spells out why it matters. Inventing a reason for
      // the others would be worse than leaving the line off — the panel omits it when empty.
      why: why ? tidy(dropSeverity(why[1]!)) : '',
    };
  });
}

/** The fixture tags each correction `*(significant)*` or `*(minor — wording)*`; that is metadata. */
function dropSeverity(input: string): string {
  return input.replace(/\*\((?:significant|minor)[^)]*\)\*/gi, '');
}

function parseOpenQuestions(body: string[]): OpenQuestion[] {
  return numberedItems(body).map((item) => {
    const clean = tidy(item.replace(/^\d+\.\s*/, ''));

    // Each entry ends with what to actually do about it — a sentence starting "Confirm" or
    // "Check". Splitting there keeps the situation and the action apart, which is how the panel
    // renders them; splitting on the source's line wrapping cuts sentences in half.
    const action = /(?:^|\s)(\*{0,2}(?:Confirm|Check)\b[\s\S]*)$/.exec(clean);

    return {
      sectionId: '',
      question: tidy(action ? clean.slice(0, action.index) : clean),
      why: tidy(action?.[1] ?? 'Confirm this with your teacher or textbook.'),
    };
  });
}

function parseGlossary(text: string): GlossaryEntry[] {
  return text
    .split(/\s·\s/)
    .map((entry) => {
      const parsed = /\*\*([^*]+)\*\*\s*(?:—|--)\s*([\s\S]+)/.exec(entry.trim());
      if (!parsed) return null;
      return {
        term: tidy(parsed[1]!),
        definition: tidy(parsed[2]!.replace(/\.$/, '')),
        sectionId: '',
      } satisfies GlossaryEntry;
    })
    .filter((entry): entry is GlossaryEntry => entry !== null);
}

function parseFlashcards(body: string[]): Flashcard[] {
  return bulletList(body)
    .map((item) => {
      const parsed = /\*\*Q:\*\*\s*([\s\S]*?)\*\*A:\*\*\s*([\s\S]*)/.exec(item);
      if (!parsed) return null;
      return { front: tidy(parsed[1]!), back: tidy(parsed[2]!), sectionId: '' } satisfies Flashcard;
    })
    .filter((card): card is Flashcard => card !== null);
}

function parseQuiz(body: string[]): QuizItem[] {
  return numberedItems(body).map((item) => {
    const clean = item.replace(/^\d+\.\s*/, '');
    const multipleChoice = /\*\(MC\)\*/.test(clean);
    const [prompt, tail] = splitOnce(clean.replace(/\*\((?:MC|short)\)\*\s*/, ''), '—');
    const choices = [...(tail ?? '').matchAll(/([A-D])\)\s*([^A-D)]+)/g)].map((m) => tidy(m[2]!));

    return {
      kind: multipleChoice ? 'multiple-choice' : 'short-answer',
      prompt: tidy(prompt ?? clean),
      ...(choices.length ? { choices } : {}),
      answer: tidy((tail ?? '').replace(/\*\(from[^)]*\)\*/, '')),
      explanation: '',
      sectionId: '',
    } satisfies QuizItem;
  });
}

/* -------------------------------------------------------------------------- *
 * Derivations the fixture implies but does not spell out
 * -------------------------------------------------------------------------- */

/**
 * Corrections and open questions are written as prose in the fixture, with no section reference —
 * but the outline rail's dot and the "jump to it" affordance both need one.
 *
 * The heuristic, in order: an explicit "1.4"-style topic number in the text, then the section
 * whose title shares a distinctive word with it. Anything it cannot place keeps an empty
 * `sectionId`, which the renderer treats as "belongs to the document, not to a section" — the
 * correct answer for a correction about the note as a whole.
 */
function assignSectionIds(doc: NoteDocument): void {
  const place = (text: string): string => {
    const topic = /\b(\d+\.\d+)\b/.exec(text)?.[1];
    if (topic) {
      const bySection = doc.sections.find((section) => section.title.startsWith(topic));
      if (bySection) return bySection.id;
    }

    const words = new Set(
      text
        .toLowerCase()
        .match(/[a-z₀-₉]{6,}/g)
        ?.map((word) => word.replace(/s$/, '')) ?? [],
    );
    const scored = doc.sections
      .map((section) => {
        const haystack = new Set(
          `${section.title} ${sectionText(section)}`
            .toLowerCase()
            .match(/[a-z₀-₉]{6,}/g)
            ?.map((word) => word.replace(/s$/, '')) ?? [],
        );
        return {
          id: section.id,
          score: [...words].filter((word) => haystack.has(word)).length,
        };
      })
      // Ties go to the earliest section: a topic is introduced before it is referred back to.
      .sort((a, b) => b.score - a.score)[0];

    return scored && scored.score > 0 ? scored.id : '';
  };

  for (const correction of doc.corrections) {
    correction.sectionId = place(`${correction.original} ${correction.corrected}`);
  }
  for (const question of doc.openQuestions) {
    question.sectionId = place(`${question.question} ${question.why}`);
  }
}

/**
 * A figure the fixture itself marks as illustrative is, by the product's own rules, something to
 * double-check (06 §5.2) — the numbers are plausible rather than measured. Turning that into a
 * `factCheck` flag is reading the fixture's annotation, not inventing a doubt.
 */
function flagIllustrativeFigures(doc: NoteDocument): void {
  for (const section of doc.sections) {
    for (const block of section.blocks) {
      if (block.type !== 'diagram' || !block.spec?.illustrative) continue;
      doc.factCheck.flags.push({
        sectionId: section.id,
        claim: block.caption,
        issue:
          'The values in this figure are illustrative rather than measured. Check them against ' +
          'your data booklet before quoting them.',
        confidence: 'medium',
      });
    }
  }
  doc.factCheck.checkedClaims = doc.corrections.length + doc.factCheck.flags.length;
}

/**
 * ADAPTER-SUPPLIED, and the one thing here that is not in the markdown.
 *
 * The fixture names nicotine in prose but has no way to express a chemical structure — it is
 * plain markdown. The renderer needs a `structure` block to exercise smiles-drawer, and a real
 * pipeline run on this lesson would certainly draw the compound it just identified. So the
 * adapter adds one, beside the example that names it. It is flagged here rather than buried
 * because it is the single place the rendered fixture says more than the file does.
 */
function addStructureForNamedCompound(doc: NoteDocument): void {
  const section = doc.sections.find((candidate) =>
    candidate.blocks.some(
      (block) => block.type === 'workedExample' && /C_?5H_?7N|C5H7N/.test(block.problem),
    ),
  );
  if (!section) return;

  section.blocks.push({
    type: 'structure',
    smiles: 'CN1CCC[C@H]1c1cccnc1',
    caption: 'Nicotine, the compound with molecular formula C₁₀H₁₄N₂.',
    alt: 'Skeletal structure of nicotine: a pyridine ring joined to an N-methylpyrrolidine ring.',
    origin: 'ai-added',
  });
}

/** All the prose in a section, flattened — enough for a word-overlap match. */
function sectionText(section: Section): string {
  return section.blocks
    .map((block) => {
      switch (block.type) {
        case 'paragraph':
          return block.text;
        case 'list':
          return block.items.join(' ');
        case 'definition':
          return `${block.term} ${block.definition}`;
        case 'callout':
          return `${block.title ?? ''} ${block.text}`;
        case 'workedExample':
          return `${block.problem} ${block.commonMistake}`;
        case 'table':
          return `${block.columns.map((c) => c.header).join(' ')} ${block.rows.flat().join(' ')}`;
        default:
          return '';
      }
    })
    .join(' ');
}

function countOrigin(doc: NoteDocument, origin: Block['origin']): number {
  return doc.sections.reduce(
    (total, section) => total + section.blocks.filter((block) => block.origin === origin).length,
    0,
  );
}

/* -------------------------------------------------------------------------- *
 * Small helpers
 * -------------------------------------------------------------------------- */

function takeWhile(
  lines: string[],
  start: number,
  predicate: (line: string) => boolean,
): [string[], number] {
  let index = start;
  const taken: string[] = [];
  while (index < lines.length && predicate(lines[index]!)) {
    taken.push(lines[index]!);
    index += 1;
  }
  // A predicate that also accepts blank lines can run past the end of the construct; trim back.
  while (taken.length && taken.at(-1)!.trim() === '') taken.pop();
  return [taken, Math.max(index, start + 1)];
}

/** List items may wrap onto indented continuation lines; those belong to the item above. */
function takeListItems(lines: string[], start: number, ordered: boolean): [string[], number] {
  const marker = ordered ? /^\d+\.\s+/ : /^[-*]\s+/;
  const items: string[] = [];
  let index = start;

  while (index < lines.length) {
    const line = lines[index]!;
    const trimmed = line.trim();
    if (marker.test(trimmed)) {
      items.push(trimmed.replace(marker, ''));
    } else if (items.length && /^\s+\S/.test(line)) {
      items[items.length - 1] += ` ${trimmed}`;
    } else {
      break;
    }
    index += 1;
  }

  return [items, Math.max(index, start + 1)];
}

function numberedItems(body: string[]): string[] {
  const items: string[] = [];
  for (const line of body) {
    if (/^\d+\.\s/.test(line.trim())) items.push(line.trim());
    else if (items.length && line.trim()) items[items.length - 1] += `\n${line.trim()}`;
  }
  return items;
}

function bulletList(body: string[]): string[] {
  const items: string[] = [];
  for (const line of body) {
    const trimmed = line.trim();
    // A horizontal rule ends the list; without this the separator lands inside the last item.
    if (/^-{3,}$/.test(trimmed)) break;
    if (/^[-*]\s/.test(trimmed)) items.push(trimmed.replace(/^[-*]\s+/, ''));
    else if (items.length && trimmed) items[items.length - 1] += ` ${trimmed}`;
  }
  return items;
}

function splitOnce(input: string, separator: string): [string, string | undefined] {
  const at = input.indexOf(separator);
  if (at === -1) return [input, undefined];
  return [input.slice(0, at), input.slice(at + separator.length)];
}

function stripQuotes(input: string): string {
  return input
    .replace(/\*\*/g, '')
    .trim()
    .replace(/^[“"']+/, '')
    .replace(/[”"']+$/, '');
}

/** A speakable version of a boxed answer — for the screen-reader line beside the rendered maths. */
function stripMath(input: string): string {
  return input
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\times/g, '×')
    .replace(/\^\{?(-?\d+)\}?/g, '^$1')
    .replace(/\\[a-z]+/gi, ' ')
    .replace(/[{}\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tidy(input: string): string {
  return input
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function slug(title: string, index: number): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return base ? `s-${base}` : `s-${index}`;
}
