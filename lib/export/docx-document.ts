/**
 * `ExportModel` → a `docx` Document (06 §2).
 *
 * **This module is reached only from `docx.worker.ts`.** `docx` is ~600 KB and can no more run in
 * the Cloudflare Worker than TipTap can, so `next.config.ts` aliases it out of the server
 * compilation and the only thing that loads it in the browser is the Web Worker — which is also
 * where it belongs, because packing a zip of XML for a forty-block note blocks the main thread for
 * long enough to drop frames. It is a plain function of plain data so that the mapping is a unit
 * test rather than a file somebody has to open in Word.
 *
 * Two fidelity decisions worth knowing about:
 *
 * **Maths is a LaTeX line, not OMML.** `docx` has OMML primitives but no LaTeX converter, and the
 * subset that matters most here — mhchem's `\ce{}` — has no OMML analogue at all, so a partial
 * converter would silently mangle exactly the chemistry this product exists to get right. A clean
 * LaTeX line is honest, editable, and Word 2016+ converts it in place through its own equation
 * editor. Tracked for v1.1.
 *
 * **Every image is a PNG**, re-encoded by `figures.ts`, because Word cannot open the WebP that
 * phase-03 stores photos as.
 */
import {
  AlignmentType,
  BorderStyle,
  CommentRangeEnd,
  CommentRangeStart,
  CommentReference,
  Document,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { ICommentOptions, IParagraphOptions, ParagraphChild } from 'docx';

import type { Origin } from '@/lib/ai/schema';

import { tokensFor } from './inline';
import { toPlainText } from './inline';
import type { InlineToken } from '@/lib/render/markdown/tokens';
import { EXPORT_DISCLAIMER } from './types';
import type { ExportBlock, ExportModel, ExportSection, RasterAsset } from './types';

/**
 * The document's palette — paper, in both themes.
 *
 * Phase-06 settled this for the saved thumbnail and it holds for every stored artefact: baking the
 * reader's current theme into a file they will open next month in Word is wrong, and a dark-mode
 * `.docx` empties a cartridge. These are the light tokens, resolved once.
 */
const INK = '18202A';
const MUTED = '55504A';
const ACCENT = '315F9A';
const RULE = 'D9D4CA';
const WASH = 'F5F3EE';

/** What each non-student origin looks like in the file, and what its comment says. */
const PROVENANCE: Record<Exclude<Origin, 'student'>, { colour: string; label: string }> = {
  'ai-added': { colour: ACCENT, label: 'Added by Lumen — not in your original notes.' },
  'ai-clarified': { colour: '4A5A6A', label: 'Reworded by Lumen for clarity.' },
  'ai-corrected': { colour: '8A5A1A', label: 'Corrected by Lumen — see the Corrections appendix.' },
};

const ORDERED = 'lumen-ordered';

/** Half-points, which is how Word measures type. */
const pt = (size: number) => size * 2;

/**
 * Collects the Word comments as the body is built.
 *
 * Comments are a document-level list that body elements refer to by id, so the two have to be
 * built together — hence a small mutable collector rather than a second pass.
 */
class Comments {
  private readonly items: ICommentOptions[] = [];

  add(text: string): number {
    const id = this.items.length + 1;
    this.items.push({
      id,
      author: 'Lumen',
      initials: 'L',
      date: new Date(),
      children: [new Paragraph({ children: [new TextRun({ text, size: pt(9) })] })],
    });
    return id;
  }

  all(): readonly ICommentOptions[] {
    return this.items;
  }
}

export function buildDocxDocument(model: ExportModel, rasters: Map<string, RasterAsset>): Document {
  const comments = new Comments();
  const body: (Paragraph | Table)[] = [
    ...titleBlock(model),
    ...model.sections.flatMap((section) => sectionOf(section, rasters, comments, model)),
    ...endnotes(model),
    ...corrections(model),
    ...openQuestions(model),
    ...glossary(model),
    ...furtherStudy(model),
    ...studyTools(model),
    ...colophon(model),
  ];

  return new Document({
    title: toPlainText(model.title),
    description: model.summary,
    creator: 'Lumen',
    subject: model.breadcrumb,
    numbering: {
      config: [
        {
          reference: ORDERED,
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.START,
            },
          ],
        },
      ],
    },
    comments: { children: comments.all() },
    sections: [{ children: body }],
  });
}

/* ------------------------------- Front matter ------------------------------ */

function titleBlock(model: ExportModel): Paragraph[] {
  const out: Paragraph[] = [];

  if (model.breadcrumb) {
    out.push(
      new Paragraph({
        children: [new TextRun({ text: model.breadcrumb, color: MUTED, size: pt(9.5) })],
        spacing: { after: 80 },
      }),
    );
  }

  out.push(
    new Paragraph({
      children: [new TextRun({ text: toPlainText(model.title), bold: true, size: pt(22) })],
      spacing: { after: 200 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 8 } },
    }),
  );

  if (model.options.includeProvenance) {
    out.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Colour marks what changed. ', color: MUTED, size: pt(9) }),
          new TextRun({ text: 'Added', color: ACCENT, size: pt(9) }),
          new TextRun({ text: ' · ', color: MUTED, size: pt(9) }),
          new TextRun({ text: 'Reworded', color: PROVENANCE['ai-clarified'].colour, size: pt(9) }),
          new TextRun({ text: ' · ', color: MUTED, size: pt(9) }),
          new TextRun({ text: 'Corrected', color: PROVENANCE['ai-corrected'].colour, size: pt(9) }),
          new TextRun({ text: '. Everything in black is yours.', color: MUTED, size: pt(9) }),
        ],
        spacing: { after: 200 },
      }),
    );
  }

  if (model.summary) {
    out.push(
      heading('In one paragraph', HeadingLevel.HEADING_2),
      new Paragraph({ children: runs(model.summary), spacing: { after: 160 } }),
    );
  }

  if (model.objectives.length) {
    out.push(heading('What you should be able to do', HeadingLevel.HEADING_2));
    for (const line of model.objectives) {
      out.push(new Paragraph({ children: runs(line), bullet: { level: 0 } }));
    }
  }

  return out;
}

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]): Paragraph {
  return new Paragraph({
    heading: level,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, color: INK })],
  });
}

/* --------------------------------- Sections -------------------------------- */

function sectionOf(
  section: ExportSection,
  rasters: Map<string, RasterAsset>,
  comments: Comments,
  model: ExportModel,
): (Paragraph | Table)[] {
  const level = section.level === 2 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2;
  return [
    heading(toPlainText(section.title), level),
    ...section.blocks.flatMap((row) => blockOf(row, rasters, comments, model)),
  ];
}

/**
 * A block's provenance, as the colour its runs take and the comment anchored to it.
 *
 * Both, deliberately: colour survives a copy-paste into an email and prints, and the comment is
 * the only one of the two that says *why*. A reader with the comments pane closed still sees that
 * something changed.
 */
function marked(
  origin: Origin | null,
  comments: Comments,
): { colour?: string; open: ParagraphChild[]; close: ParagraphChild[] } {
  if (!origin || origin === 'student') return { open: [], close: [] };
  const { colour, label } = PROVENANCE[origin];
  const id = comments.add(label);
  return {
    colour,
    open: [new CommentRangeStart(id)],
    close: [new CommentRangeEnd(id), new TextRun({ children: [new CommentReference(id)] })],
  };
}

function blockOf(
  row: ExportBlock,
  rasters: Map<string, RasterAsset>,
  comments: Comments,
  model: ExportModel,
): (Paragraph | Table)[] {
  const { block } = row;
  const provenance = model.options.includeProvenance ? row.origin : null;
  const { colour, open, close } = marked(provenance, comments);
  const tail = endnoteMarkers(row);

  const wrap = (children: ParagraphChild[], options: Omit<IParagraphOptions, 'children'> = {}) =>
    new Paragraph({ ...options, children: [...open, ...children, ...tail, ...close] });

  switch (block.type) {
    case 'paragraph':
      return [wrap(runs(block.text, colour), { spacing: { after: 140 } })];

    case 'list':
      return block.items.map(
        (item, index) =>
          new Paragraph({
            children: [
              ...(index === 0 ? open : []),
              ...runs(item, colour),
              ...(index === block.items.length - 1 ? [...tail, ...close] : []),
            ],
            ...(block.ordered
              ? { numbering: { reference: ORDERED, level: 0 } }
              : { bullet: { level: 0 } }),
          }),
      );

    case 'definition':
      return [
        wrap(
          [
            new TextRun({
              text: `${toPlainText(block.term)} — `,
              bold: true,
              color: colour ?? INK,
            }),
            ...runs(block.definition, colour),
          ],
          { spacing: { after: 140 } },
        ),
      ];

    case 'formula': {
      const out: Paragraph[] = [
        wrap(
          [
            new TextRun({
              text: block.latex,
              font: 'Consolas',
              color: colour ?? INK,
              size: pt(11),
            }),
          ],
          { alignment: AlignmentType.CENTER, spacing: { before: 120, after: 100 } },
        ),
      ];
      for (const variable of block.where) {
        out.push(
          new Paragraph({
            children: [
              new TextRun({ text: `${variable.symbol} `, italics: true, color: MUTED }),
              new TextRun({
                text: `${toPlainText(variable.meaning)} (${variable.units})`,
                color: MUTED,
                size: pt(9.5),
              }),
            ],
            bullet: { level: 0 },
          }),
        );
      }
      if (block.useWhen) {
        out.push(
          new Paragraph({
            children: [
              new TextRun({ text: 'Use when: ', bold: true, color: MUTED, size: pt(9.5) }),
              ...runs(block.useWhen, MUTED, pt(9.5)),
            ],
            spacing: { after: 140 },
          }),
        );
      }
      return out;
    }

    case 'workedExample': {
      const out: Paragraph[] = [
        wrap(
          [
            new TextRun({ text: 'Worked example. ', bold: true, color: colour ?? INK }),
            ...runs(block.problem, colour),
          ],
          { spacing: { before: 160, after: 100 } },
        ),
      ];
      block.steps.forEach((step) => {
        out.push(
          new Paragraph({ children: runs(step.text), numbering: { reference: ORDERED, level: 0 } }),
        );
        if (step.latex) {
          out.push(
            new Paragraph({
              children: [new TextRun({ text: step.latex, font: 'Consolas', size: pt(10.5) })],
              alignment: AlignmentType.CENTER,
              spacing: { before: 60, after: 60 },
            }),
          );
        }
      });
      out.push(
        new Paragraph({
          children: [
            new TextRun({ text: 'Answer: ', bold: true }),
            // The renderer shows `answerLatex` instead of `answer`, not as well as it.
            block.answerLatex
              ? new TextRun({ text: block.answerLatex, font: 'Consolas' })
              : new TextRun({ text: toPlainText(block.answer) }),
          ],
          spacing: { before: 100, after: 80 },
          shading: { type: ShadingType.CLEAR, fill: WASH },
        }),
      );
      if (block.commonMistake) {
        out.push(
          new Paragraph({
            children: [
              new TextRun({ text: 'Common mistake. ', bold: true, color: MUTED, size: pt(9.5) }),
              ...runs(block.commonMistake, MUTED, pt(9.5)),
            ],
            spacing: { after: 160 },
          }),
        );
      }
      return out;
    }

    case 'callout': {
      const children: ParagraphChild[] = [];
      if (block.title) {
        children.push(
          new TextRun({ text: `${toPlainText(block.title)}. `, bold: true, color: colour ?? INK }),
        );
      }
      children.push(...runs(block.text, colour));
      return [
        wrap(children, {
          shading: { type: ShadingType.CLEAR, fill: WASH },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 8 } },
          spacing: { before: 140, after: 140 },
        }),
      ];
    }

    case 'misconception':
      return [
        wrap(
          [
            new TextRun({
              text: 'Not quite: ',
              bold: true,
              color: PROVENANCE['ai-corrected'].colour,
            }),
            ...runs(block.wrong, MUTED),
          ],
          { spacing: { before: 140 } },
        ),
        new Paragraph({
          children: [new TextRun({ text: 'Actually: ', bold: true }), ...runs(block.right, colour)],
          spacing: { after: 140 },
        }),
      ];

    case 'table':
      return tableOf(block.caption, block.columns, block.rows);

    case 'diagram':
    case 'structure':
    case 'figure':
      return figureOf(row, rasters, block.caption, block.alt, colour);
  }
}

function endnoteMarkers(row: ExportBlock): ParagraphChild[] {
  return row.endnotes.length
    ? [new TextRun({ text: ` [${row.endnotes.join('] [')}]`, superScript: true, color: MUTED })]
    : [];
}

function tableOf(
  caption: string,
  columns: { header: string; numeric?: boolean }[],
  rows: string[][],
): (Paragraph | Table)[] {
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: columns.map(
          (column) =>
            new TableCell({
              shading: { type: ShadingType.CLEAR, fill: WASH },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: toPlainText(column.header), bold: true, size: pt(9.5) }),
                  ],
                }),
              ],
            }),
        ),
      }),
      ...rows.map(
        (cells) =>
          new TableRow({
            children: cells.map(
              (cell, index) =>
                new TableCell({
                  children: [
                    new Paragraph({
                      children: runs(cell, undefined, pt(9.5)),
                      alignment: columns[index]?.numeric
                        ? AlignmentType.RIGHT
                        : AlignmentType.START,
                    }),
                  ],
                }),
            ),
          }),
      ),
    ],
  });

  const out: (Paragraph | Table)[] = [table];
  if (caption) out.push(captionParagraph(caption));
  return out;
}

function figureOf(
  row: ExportBlock,
  rasters: Map<string, RasterAsset>,
  caption: string,
  alt: string,
  colour?: string,
): Paragraph[] {
  const id = row.block.id;
  const raster = id ? rasters.get(id) : undefined;
  const label = row.figureNumber ? `Figure ${row.figureNumber}. ` : '';

  if (!raster) {
    // A visual that would not rasterise keeps its caption and its alt text. A hole in the document
    // tells the reader nothing; this tells them what was meant to be there.
    return [
      new Paragraph({
        children: [
          new TextRun({
            text: `${label}${toPlainText(caption)} — `,
            italics: true,
            color: MUTED,
            size: pt(9.5),
          }),
          new TextRun({ text: toPlainText(alt), color: MUTED, size: pt(9.5) }),
        ],
        spacing: { before: 140, after: 140 },
      }),
    ];
  }

  // Word measures pictures in points at 72/inch; the rasters are drawn at 2x for sharpness, and
  // 468pt is the text width of an A4 page with the margins this document uses.
  const width = Math.min(468, raster.width / 2);
  const height = (raster.height / raster.width) * width;

  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 160, after: 80 },
      children: [
        new ImageRun({
          type: 'png',
          data: raster.png,
          transformation: { width, height },
          altText: {
            name: label || 'Figure',
            description: toPlainText(alt),
            title: toPlainText(caption),
          },
        }),
      ],
    }),
    captionParagraph(`${label}${caption}`, colour),
  ];
}

function captionParagraph(caption: string, colour?: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 160 },
    children: runs(caption, colour ?? MUTED, pt(9)),
  });
}

/* -------------------------------- Appendices ------------------------------- */

function endnotes(model: ExportModel): Paragraph[] {
  if (!model.endnotes.length) return [];
  return [
    heading('Notes', HeadingLevel.HEADING_1),
    ...model.endnotes.map(
      (note) =>
        new Paragraph({
          children: [
            new TextRun({ text: `${note.number}. `, bold: true, color: MUTED }),
            ...runs(note.text),
          ],
          spacing: { after: 100 },
        }),
    ),
  ];
}

/**
 * Corrections and open questions ship in every export whatever the toggles say (06 §5.1, §5.3).
 * They are the reason the document can be trusted, and a study guide that quietly drops them is a
 * different document.
 */
function corrections(model: ExportModel): Paragraph[] {
  if (!model.corrections.length) return [];
  return [
    heading('Corrections — what to relearn', HeadingLevel.HEADING_1),
    ...model.corrections.flatMap((correction) => {
      const out = [
        new Paragraph({ children: runs(correction.corrected), bullet: { level: 0 } }),
        new Paragraph({
          children: [
            new TextRun({ text: 'You had: ', bold: true, color: MUTED, size: pt(9.5) }),
            ...runs(correction.original, MUTED, pt(9.5)),
          ],
          indent: { left: 720 },
        }),
      ];
      if (correction.why.trim()) {
        out.push(
          new Paragraph({
            children: runs(correction.why, MUTED, pt(9.5)),
            indent: { left: 720 },
            spacing: { after: 100 },
          }),
        );
      }
      return out;
    }),
  ];
}

function openQuestions(model: ExportModel): Paragraph[] {
  if (!model.openQuestions.length) return [];
  return [
    heading('Open questions — confirm these', HeadingLevel.HEADING_1),
    ...model.openQuestions.flatMap((question) => {
      const out = [new Paragraph({ children: runs(question.question), bullet: { level: 0 } })];
      if (question.why.trim()) {
        out.push(
          new Paragraph({
            children: runs(question.why, MUTED, pt(9.5)),
            indent: { left: 720 },
            spacing: { after: 100 },
          }),
        );
      }
      return out;
    }),
  ];
}

function glossary(model: ExportModel): Paragraph[] {
  if (!model.glossary.length) return [];
  return [
    heading('Glossary', HeadingLevel.HEADING_1),
    ...model.glossary.map(
      (entry) =>
        new Paragraph({
          children: [
            new TextRun({ text: `${toPlainText(entry.term)} — `, bold: true }),
            ...runs(entry.definition),
          ],
          spacing: { after: 80 },
        }),
    ),
  ];
}

function furtherStudy(model: ExportModel): Paragraph[] {
  if (!model.furtherStudy.length) return [];
  return [
    heading('Study next', HeadingLevel.HEADING_1),
    ...model.furtherStudy.map(
      (line) => new Paragraph({ children: runs(line), bullet: { level: 0 } }),
    ),
  ];
}

function studyTools(model: ExportModel): Paragraph[] {
  const out: Paragraph[] = [];

  if (model.flashcards.length) {
    out.push(heading('Flashcards', HeadingLevel.HEADING_1));
    for (const card of model.flashcards) {
      out.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${toPlainText(card.front)} `, bold: true }),
            ...runs(card.back, MUTED),
          ],
          spacing: { after: 80 },
        }),
      );
    }
  }

  if (model.quiz.length) {
    out.push(heading('Quiz', HeadingLevel.HEADING_1));
    model.quiz.forEach((item) => {
      out.push(
        new Paragraph({ children: runs(item.prompt), numbering: { reference: ORDERED, level: 0 } }),
      );
      for (const choice of item.choices ?? []) {
        out.push(new Paragraph({ children: runs(choice), bullet: { level: 0 } }));
      }
      out.push(
        new Paragraph({
          children: [new TextRun({ text: 'Answer: ', bold: true }), ...runs(item.answer)],
          indent: { left: 720 },
        }),
      );
      if (item.explanation.trim()) {
        out.push(
          new Paragraph({
            children: runs(item.explanation, MUTED, pt(9.5)),
            indent: { left: 720 },
            spacing: { after: 100 },
          }),
        );
      }
    });
  }

  return out;
}

function colophon(model: ExportModel): Paragraph[] {
  const made = model.model ? `Rebuilt with ${model.model}. ` : '';
  return [
    new Paragraph({
      spacing: { before: 320 },
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 8 } },
      children: [
        new TextRun({
          text: `${made}${EXPORT_DISCLAIMER}`,
          italics: true,
          color: MUTED,
          size: pt(9),
        }),
      ],
    }),
  ];
}

/* ---------------------------------- Inline --------------------------------- */

/** One inline string as Word runs, through the same tokenizer every other format uses. */
function runs(text: string, colour?: string, size?: number): ParagraphChild[] {
  return tokensFor(text).flatMap((token) => runOf(token, { color: colour ?? INK, size }));
}

interface RunStyle {
  color: string;
  size?: number | undefined;
  bold?: boolean;
  italics?: boolean;
}

function runOf(token: InlineToken, style: RunStyle): ParagraphChild[] {
  const base = { color: style.color, ...(style.size ? { size: style.size } : {}) };
  switch (token.kind) {
    case 'text':
      return [new TextRun({ ...base, text: token.text, bold: style.bold, italics: style.italics })];
    case 'code':
      return [new TextRun({ ...base, text: token.text, font: 'Consolas' })];
    // The LaTeX, as LaTeX. See the note at the top of this file.
    case 'math':
      return [new TextRun({ ...base, text: token.latex, font: 'Consolas' })];
    case 'link':
      return [new TextRun({ ...base, text: token.text, underline: {}, color: ACCENT })];
    case 'bold':
      return token.children.flatMap((child) => runOf(child, { ...style, bold: true }));
    case 'italic':
      return token.children.flatMap((child) => runOf(child, { ...style, italics: true }));
  }
}
