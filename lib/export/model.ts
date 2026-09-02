/**
 * `NoteDocument` → `ExportModel` (06 §2).
 *
 * Pure, synchronous and dependency-free, so every format's behaviour under the two toggles is one
 * unit test rather than four end-to-end ones.
 */
import type { Block, MarginNoteBlock, NoteDocument, Section } from '@/lib/ai/schema';

import { DEFAULT_EXPORT_OPTIONS } from './types';
import type {
  ExportBlock,
  ExportEndnote,
  ExportModel,
  ExportOptions,
  ExportSection,
} from './types';

/** Blocks that are drawn rather than typeset, and therefore need a raster in the flat formats. */
const VISUAL_TYPES = new Set(['diagram', 'structure', 'figure']);

export function isVisual(block: Block): boolean {
  return VISUAL_TYPES.has(block.type);
}

export function buildExportModel(
  doc: NoteDocument,
  options: ExportOptions = DEFAULT_EXPORT_OPTIONS,
  meta: { model?: string | null; generatedAt?: number | null } = {},
): ExportModel {
  const endnotes: ExportEndnote[] = [];
  let figureNumber = 0;

  const sections: ExportSection[] = doc.sections.map((section) => ({
    id: section.id,
    title: section.title,
    level: section.level,
    blocks: flow(section, options, endnotes, () => (figureNumber += 1)),
  }));

  return {
    title: doc.title,
    context: doc.context,
    breadcrumb: [doc.context.course, doc.context.unit].filter(Boolean).join(' · '),
    summary: doc.summary,
    objectives: doc.objectives,
    sections,
    endnotes,
    // Corrections and open questions are not a study tool and are never optional: 06 §5 items 1
    // and 3 make them the whole reason a student can trust the document. They ship in every
    // export, in both appendices, however the toggles are set.
    corrections: doc.corrections,
    openQuestions: doc.openQuestions,
    glossary: doc.glossary,
    furtherStudy: doc.furtherStudy ?? [],
    flashcards: options.includeStudyTools ? doc.studyTools.flashcards : [],
    quiz: options.includeStudyTools ? doc.studyTools.quiz : [],
    model: meta.model ?? null,
    generatedAt: meta.generatedAt ?? null,
    options,
  };
}

/**
 * Walks a section, lifting margin notes into endnotes as it goes.
 *
 * A margin note is anchored to the block *before* it unless it names one, which is how the
 * renderer aligns them on a wide screen; the flat formats put the marker on the same block so a
 * reader following a superscript lands where they would have looked on screen.
 */
function flow(
  section: Section,
  options: ExportOptions,
  endnotes: ExportEndnote[],
  nextFigure: () => number,
): ExportBlock[] {
  const rows: ExportBlock[] = [];

  for (const block of section.blocks) {
    if (block.type === 'marginNote') {
      const note = block as MarginNoteBlock;
      const number = endnotes.length + 1;
      endnotes.push({
        number,
        kind: note.kind,
        text: note.text,
        origin: options.includeProvenance ? note.origin : null,
      });
      const anchor = note.anchorId
        ? rows.find((row) => row.block.id === note.anchorId)
        : rows[rows.length - 1];
      // An unanchored note at the very top of a section has nothing before it to hang on. It
      // still becomes an endnote — losing a student's own mnemonic to a layout technicality is
      // not a trade any of this is worth — it simply carries no in-text marker.
      anchor?.endnotes.push(number);
      continue;
    }

    rows.push({
      block: block as ExportBlock['block'],
      origin: options.includeProvenance ? block.origin : null,
      ...(isVisual(block) ? { figureNumber: nextFigure() } : {}),
      endnotes: [],
    });
  }

  return rows;
}

/** Every block that will need rasterizing, in document order. */
export function visualBlocks(model: ExportModel): ExportBlock[] {
  return model.sections.flatMap((section) => section.blocks.filter((row) => isVisual(row.block)));
}
