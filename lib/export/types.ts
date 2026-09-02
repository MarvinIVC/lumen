/**
 * The shape every exporter consumes (06 §2).
 *
 * PDF, Word, Markdown and Anki are four emitters over one model, so the two toggles in
 * `ExportMenu` are applied in exactly one place. Four exporters each deciding for themselves what
 * "notes only" means is four chances for them to disagree, and the disagreement would only ever be
 * visible in the exported file.
 */
import type {
  Block,
  Correction,
  Flashcard,
  GlossaryEntry,
  MarginNoteBlock,
  NoteContext,
  OpenQuestion,
  Origin,
  QuizItem,
} from '@/lib/ai/schema';

export type ExportFormat = 'pdf' | 'docx' | 'markdown' | 'anki';

export interface ExportOptions {
  /** Flashcards and the quiz. Anki ignores it — the cards *are* the format (see `anki.ts`). */
  includeStudyTools: boolean;
  /** The AI-provenance marks, not the AI content: turning it off keeps every block. */
  includeProvenance: boolean;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  includeStudyTools: true,
  includeProvenance: true,
};

/** A block in its place, with the numbering the flat formats need resolved up front. */
export interface ExportBlock {
  block: Exclude<Block, MarginNoteBlock>;
  /** Null when the student asked for no provenance marks. */
  origin: Origin | null;
  /** 1-based, for "Figure 3" captions. Only on `figure`, `diagram` and `structure`. */
  figureNumber?: number;
  /** Endnotes anchored to this block, in order. */
  endnotes: number[];
}

/**
 * A margin note, lifted out of the flow and numbered.
 *
 * Print already does this (`NoteDocument` collects them under `forPrint`), and Word, Markdown and
 * PDF all lack a margin to put them in. Anki never sees them.
 */
export interface ExportEndnote {
  number: number;
  kind: MarginNoteBlock['kind'];
  text: string;
  origin: Origin | null;
}

export interface ExportSection {
  id: string;
  title: string;
  level: 2 | 3;
  blocks: ExportBlock[];
}

export interface ExportModel {
  title: string;
  context: NoteContext;
  /** "Chemistry · Unit 1" — the running header, and the Notion/Drive breadcrumb. */
  breadcrumb: string;
  summary: string;
  objectives: string[];
  sections: ExportSection[];
  endnotes: ExportEndnote[];
  corrections: Correction[];
  openQuestions: OpenQuestion[];
  glossary: GlossaryEntry[];
  furtherStudy: string[];
  /** Empty unless `includeStudyTools`. */
  flashcards: Flashcard[];
  quiz: QuizItem[];
  /** "Rebuilt with DeepSeek V4" (06 §5.7) — carried into every format's colophon. */
  model: string | null;
  generatedAt: number | null;
  options: ExportOptions;
}

/** Every visual an exporter may need as pixels, keyed by block id. */
export interface RasterAsset {
  blockId: string;
  png: ArrayBuffer;
  width: number;
  height: number;
  alt: string;
}

/** The standing disclaimer (06 §5.4). Every exported file carries it, in every format. */
export const EXPORT_DISCLAIMER =
  'Lumen rebuilt these notes with AI. It checks its work, but it can still be wrong. ' +
  'Verify anything important against your textbook and your teacher — especially the items ' +
  'marked to check.';
