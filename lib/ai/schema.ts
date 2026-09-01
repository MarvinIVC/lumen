/**
 * The NoteDocument (04-AI-ENGINE.md §5, block list §4.2, rendering contract 03-DESIGN.md §6).
 *
 * This is the single artefact the whole product revolves around: the model returns it, the
 * renderer draws it, the editor mutates it, the exporters serialise it, and `note.doc` stores it.
 *
 * Types only. The post-parse rules are `lib/ai/validate.ts`, the tolerant streaming parser is
 * `lib/ai/stream-parse.ts`, and both are kept out of this module so importing a type never pulls
 * their code into a bundle.
 */
import { SCHEMA_VERSION } from './versions.ts';
import type { PromptVersion, SchemaVersion } from './versions.ts';

export { SCHEMA_VERSION };
export { PROMPT_VERSION } from './versions.ts';

/* -------------------------------------------------------------------------- *
 * Context & options
 * -------------------------------------------------------------------------- */

export type Curriculum =
  'AP' | 'IB_HL' | 'IB_SL' | 'A_LEVEL' | 'IGCSE' | 'INTERNAL' | 'GENERAL' | 'UNKNOWN';

export type DomainFamily =
  | 'stem-quantitative'
  | 'stem-descriptive'
  | 'history-social'
  | 'literature-language-arts'
  | 'language-acquisition'
  | 'generic';

export type EnhanceMode = 'tidy' | 'complete' | 'study_guide';
export type Depth = 'match' | 'thorough' | 'brief';
export type Visuals = 'auto' | 'more' | 'none';
export type Voice = 'keep-mine' | 'textbook';

export interface NoteContext {
  subject: string;
  curriculum: Curriculum;
  course: string;
  unit: string | null;
  topic: string | null;
  /** BCP-47. Output is produced in this language. */
  language: string;
  packId?: string | null;
  domainFamily?: DomainFamily;
}

export interface EnhanceOptions {
  mode: EnhanceMode;
  depth: Depth;
  visuals: Visuals;
  voice: Voice;
}

/** Stage A output (04-AI-ENGINE.md §3). */
export interface DetectionResult {
  subject: string;
  curriculum: Curriculum;
  course: string;
  unit: string | null;
  topic: string | null;
  language: string;
  isStudyNotes: boolean;
  confidence: number;
  notes: string;
}

/* -------------------------------------------------------------------------- *
 * Provenance — required on every block (04-AI-ENGINE.md §4.2).
 * -------------------------------------------------------------------------- */

export type Origin = 'student' | 'ai-clarified' | 'ai-added' | 'ai-corrected';

export interface Provenanced {
  origin: Origin;
  /** Present when origin is 'ai-clarified' or 'ai-corrected': what the student originally wrote. */
  originalText?: string;
  /**
   * Stable address for this block within its document (schema 1.1.0).
   *
   * The model is never asked for one — it is minted on the client by `ensureBlockIds` the first
   * time a document is opened, and persisted from then on. Asking the model would put a volatile
   * string in the output for no gain and give it one more rule to break; minting it locally makes
   * it *ours*, which is what the workspace needs it to be.
   *
   * Everything in phase-05 addresses a block by this: accept/reject, the TipTap round-trip,
   * `MarginNoteBlock.anchorId`, the regenerate diff and version history. Positional paths were the
   * alternative and they break the moment anything is inserted, which is the whole activity.
   *
   * Optional in the type because a document arriving from the model has none yet; by the time it
   * reaches a renderer or the editor, `migrateNoteDocument` has given every block one.
   */
  id?: string;
}

/* -------------------------------------------------------------------------- *
 * Blocks
 * -------------------------------------------------------------------------- */

export interface InlineSpan {
  text: string;
  /** Inline provenance for a phrase inside an otherwise student-origin paragraph. */
  origin?: Origin;
  originalText?: string;
}

export interface ParagraphBlock extends Provenanced {
  type: 'paragraph';
  /** Prose. Inline math uses `$…$`. */
  text: string;
  spans?: InlineSpan[];
}

export interface ListBlock extends Provenanced {
  type: 'list';
  ordered: boolean;
  items: string[];
}

export interface DefinitionBlock extends Provenanced {
  type: 'definition';
  term: string;
  definition: string;
  /** Also collected into the glossary. */
  aliases?: string[];
}

export interface FormulaVariable {
  symbol: string;
  meaning: string;
  /** Mandatory. "dimensionless" is a valid answer; an empty string is not. */
  units: string;
}

/** Every formula is three parts — no exceptions (rubric item 2). */
export interface FormulaBlock extends Provenanced {
  type: 'formula';
  /** LaTeX for KaTeX; chemistry uses the mhchem extension. */
  latex: string;
  where: FormulaVariable[];
  useWhen: string;
  /** Display number, e.g. "1.2". */
  number?: string;
}

export interface WorkedExampleStep {
  text: string;
  latex?: string;
}

export interface WorkedExampleBlock extends Provenanced {
  type: 'workedExample';
  problem: string;
  steps: WorkedExampleStep[];
  answer: string;
  answerLatex?: string;
  commonMistake: string;
  /** Set when this finishes or fixes the student's own half-done attempt. */
  studentAttempt?: { original: string; issue: string };
}

export type DiagramEngine = 'mermaid' | 'chart';

/**
 * Shared by every chart kind. `illustrative` is not decoration: 06 §1 requires the caption to
 * say so whenever the numbers are made up, and the renderer refuses to imply precision we do
 * not have.
 */
interface ChartBase {
  /** True when the values are illustrative rather than measured. */
  illustrative: boolean;
}

/** Axis titles are mandatory — a chart without them is not readable (06 §1). */
interface AxisLabels {
  x: string;
  y: string;
}

/** Stick spectra, successive ionisation energies — a category per bar. */
export interface BarsChartSpec extends ChartBase, AxisLabels {
  kind: 'bars';
  series: { label: string; value: number }[];
  /** A one-line note under the plot, e.g. what the peaks mean. */
  note?: string;
}

/** Titration curves, rate plots. Annotations mark an x of interest (an equivalence point). */
export interface LineChartSpec extends ChartBase, AxisLabels {
  kind: 'line';
  points: { x: number; y: number }[];
  annotations?: { x: number; label: string }[];
}

/** Photoelectron spectra, energy ladders — a step function rather than a curve. */
export interface StepsChartSpec extends ChartBase, AxisLabels {
  kind: 'steps';
  points: { x: number; y: number }[];
}

/** Mixtures and percent composition. Fractions are 0–1 and should sum to about 1. */
export interface CompositionChartSpec extends ChartBase {
  kind: 'composition';
  parts: { label: string; fraction: number }[];
}

/**
 * The chart shapes the model may emit, per 06-RENDER-EXPORT-SAFETY.md §1.
 *
 * This union replaced an earlier `{ kind: 'line' | 'bar' | 'scatter' | 'stem', series[] }` shape
 * that had been written here in phase-00: the two specs disagreed, and 06 §1 is the one the
 * renderer and the prompt rubric are both written against. Phase-04 emits this shape.
 */
export type ChartSpec = BarsChartSpec | LineChartSpec | StepsChartSpec | CompositionChartSpec;

export type ChartKind = ChartSpec['kind'];

export interface DiagramBlock extends Provenanced {
  type: 'diagram';
  engine: DiagramEngine;
  /** Mermaid source when engine === 'mermaid'. */
  source?: string;
  spec?: ChartSpec;
  caption: string;
  alt: string;
}

export interface StructureBlock extends Provenanced {
  type: 'structure';
  smiles: string;
  caption: string;
  alt: string;
}

export type CalloutKind = 'definition' | 'tip' | 'warning' | 'example';

export interface CalloutBlock extends Provenanced {
  type: 'callout';
  kind: CalloutKind;
  title?: string;
  text: string;
}

/** A common wrong idea worth pre-empting — distinct from a `Correction` about this student. */
export interface MisconceptionBlock extends Provenanced {
  type: 'misconception';
  wrong: string;
  right: string;
}

export interface TableBlock extends Provenanced {
  type: 'table';
  caption: string;
  columns: { header: string; numeric?: boolean }[];
  rows: string[][];
}

export type MarginNoteKind = 'connection' | 'mnemonic' | 'exam-tip' | 'why-it-matters';

/** Tufte-style side note. Student mnemonics live here, verbatim, with origin 'student'. */
export interface MarginNoteBlock extends Provenanced {
  type: 'marginNote';
  kind: MarginNoteKind;
  text: string;
  /** Id of the block this annotates, so it can align on wide viewports. */
  anchorId?: string;
}

export interface FigureBlock extends Provenanced {
  type: 'figure';
  assetId: string;
  caption: string;
  alt: string;
}

export type Block =
  | ParagraphBlock
  | ListBlock
  | DefinitionBlock
  | FormulaBlock
  | WorkedExampleBlock
  | DiagramBlock
  | StructureBlock
  | CalloutBlock
  | MisconceptionBlock
  | TableBlock
  | MarginNoteBlock
  | FigureBlock;

export type BlockType = Block['type'];

/* -------------------------------------------------------------------------- *
 * Document
 * -------------------------------------------------------------------------- */

export interface Section {
  id: string;
  title: string;
  /** 2 or 3 — never more than three heading levels visible (03-DESIGN.md §3). */
  level: 2 | 3;
  blocks: Block[];
}

/** The student wrote something wrong; we fixed it and said why. Never a silent change. */
export interface Correction {
  sectionId: string;
  original: string;
  corrected: string;
  why: string;
}

export interface OpenQuestion {
  sectionId: string;
  question: string;
  why: string;
}

export interface FactCheckFlag {
  sectionId: string;
  claim: string;
  issue: string;
  confidence: 'low' | 'medium';
}

export interface CalculationCheck {
  where: string;
  ok: boolean;
  note: string;
}

export interface FactCheck {
  calculationsVerified: CalculationCheck[];
  checkedClaims: number;
  flags: FactCheckFlag[];
  verdict?: 'ok' | 'minor-fixes' | 'significant-fixes';
}

export interface Flashcard {
  front: string;
  back: string;
  hint?: string;
  sectionId: string;
}

export interface QuizItem {
  kind: 'multiple-choice' | 'short-answer';
  prompt: string;
  choices?: string[];
  answer: string;
  explanation: string;
  sectionId: string;
}

export interface StudyTools {
  flashcards: Flashcard[];
  quiz: QuizItem[];
}

export interface GlossaryEntry {
  term: string;
  definition: string;
  sectionId: string;
}

export interface DocumentStats {
  aiAdded: number;
  aiCorrected: number;
  openQuestions: number;
}

export interface NoteDocument {
  schemaVersion: SchemaVersion;
  promptVersion: PromptVersion;
  title: string;
  context: NoteContext;
  options: EnhanceOptions;
  summary: string;
  objectives: string[];
  sections: Section[];
  corrections: Correction[];
  openQuestions: OpenQuestion[];
  factCheck: FactCheck;
  studyTools: StudyTools;
  glossary: GlossaryEntry[];
  /**
   * "Study next" — where to go after this note. 06 §1 lists it as the last thing the renderer
   * draws, but phase-00 gave it no field; optional so documents written before it exist still
   * validate.
   */
  furtherStudy?: string[];
  stats?: DocumentStats;
}

/** The model returns exactly this — and nothing else — when the input is not study notes. */
export interface RefusedDocument {
  refused: { reason: string };
}

export type EnhanceResult = NoteDocument | RefusedDocument;

export function isRefused(result: EnhanceResult): result is RefusedDocument {
  return 'refused' in result;
}

/* -------------------------------------------------------------------------- *
 * Validation — phase-04. Signatures only.
 * -------------------------------------------------------------------------- */

export interface ValidationIssue {
  path: string;
  rule: string;
  message: string;
  /** 'error' fails the parse and triggers repair; 'repairable' is fixed in place (§5, §8). */
  severity: 'error' | 'repairable';
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  /** The document with repairable issues applied — dropped invalid SMILES, dropped bad Mermaid. */
  document?: NoteDocument;
}

/**
 * Enforces the post-parse rules in 04-AI-ENGINE.md §5, upgrades an older document, and recomputes
 * the provenance counts.
 *
 * The implementations live in `lib/ai/validate.ts` rather than here. This module is imported for
 * its types by most of the renderer, and a value export would drag the validator's ~500 lines into
 * every one of those graphs for nothing — `import type` erases, `export … from` does not.
 */
