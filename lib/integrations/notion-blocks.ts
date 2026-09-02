/**
 * `ExportModel` → Notion blocks (06 §3).
 *
 * Pure and dependency-free, so the mapping is a unit test rather than something you only find out
 * about by looking at a Notion page. It is shared by the browser and the `notion-push` edge
 * function, so it may touch neither a DOM nor a Node API — the same rule `lib/ai/**` lives under.
 *
 * **Notion's KaTeX has no mhchem.** An `equation` block whose expression contains `\ce{...}`
 * renders as a red error box in their app, which is worse than not being an equation at all: the
 * student sees a broken page and no chemistry. So a formula is checked for `\ce{` and, if it has
 * any, goes across as a picture with the LaTeX beneath it instead. Everything else is a real
 * `equation` block, which Notion renders properly and the student can edit.
 */
import type { Origin } from '@/lib/ai/schema';

import { toPlainText, tokensFor } from '@/lib/export/inline';
import type { InlineToken } from '@/lib/render/markdown/tokens';
import type { ExportBlock, ExportModel, ExportSection } from '@/lib/export/types';
import { EXPORT_DISCLAIMER } from '@/lib/export/types';

/** Notion refuses a request carrying more than 100 children, and it is a hard limit. */
export const MAX_CHILDREN = 100;

/** Rich text is capped per item; longer runs have to be split rather than truncated. */
const MAX_TEXT = 2000;

export interface NotionRichText {
  type: 'text' | 'equation';
  text?: { content: string; link?: { url: string } | null };
  equation?: { expression: string };
  annotations?: Partial<{
    bold: boolean;
    italic: boolean;
    code: boolean;
    color: string;
  }>;
}

export interface NotionBlock {
  object: 'block';
  type: string;
  [key: string]: unknown;
}

/** A picture the push has to upload before it can reference it, keyed by block id. */
export interface NotionImageRef {
  blockId: string;
  caption: string;
}

const CALLOUT_ICONS: Record<string, string> = {
  definition: '📘',
  tip: '💡',
  warning: '⚠️',
  example: '🧪',
};

const MARGIN_ICONS: Record<string, string> = {
  connection: '🔗',
  mnemonic: '🧠',
  'exam-tip': '🎯',
  'why-it-matters': '⭐',
};

const ORIGIN_COLOUR: Record<Exclude<Origin, 'student'>, string> = {
  'ai-added': 'blue',
  'ai-clarified': 'gray',
  'ai-corrected': 'orange',
};

/* --------------------------------- Rich text ------------------------------- */

function chunk(content: string): string[] {
  if (content.length <= MAX_TEXT) return [content];
  const parts: string[] = [];
  for (let index = 0; index < content.length; index += MAX_TEXT) {
    parts.push(content.slice(index, index + MAX_TEXT));
  }
  return parts;
}

function richFrom(
  tokens: InlineToken[],
  annotations: NotionRichText['annotations'] = {},
  colour?: string,
): NotionRichText[] {
  const style = colour ? { ...annotations, color: colour } : annotations;

  return tokens.flatMap((token): NotionRichText[] => {
    switch (token.kind) {
      case 'text':
        return chunk(token.text).map((content) => ({
          type: 'text' as const,
          text: { content },
          ...(Object.keys(style).length ? { annotations: style } : {}),
        }));
      case 'code':
        return [
          { type: 'text', text: { content: token.text }, annotations: { ...style, code: true } },
        ];
      // Notion has a first-class inline equation, and it is the reason this maps so well.
      case 'math':
        return [{ type: 'equation', equation: { expression: token.latex } }];
      case 'link':
        return [
          {
            type: 'text',
            text: { content: token.text, link: { url: token.href } },
            ...(Object.keys(style).length ? { annotations: style } : {}),
          },
        ];
      case 'bold':
        return richFrom(token.children, { ...annotations, bold: true }, colour);
      case 'italic':
        return richFrom(token.children, { ...annotations, italic: true }, colour);
    }
  });
}

export function rich(text: string, colour?: string): NotionRichText[] {
  return richFrom(tokensFor(text), {}, colour);
}

function plain(text: string): NotionRichText[] {
  return [{ type: 'text', text: { content: toPlainText(text).slice(0, MAX_TEXT) } }];
}

/* ---------------------------------- Blocks --------------------------------- */

function paragraph(text: string, colour?: string): NotionBlock {
  return { object: 'block', type: 'paragraph', paragraph: { rich_text: rich(text, colour) } };
}

function heading(level: 1 | 2 | 3, text: string): NotionBlock {
  const type = `heading_${level}` as const;
  return { object: 'block', type, [type]: { rich_text: plain(text) } };
}

function divider(): NotionBlock {
  return { object: 'block', type: 'divider', divider: {} };
}

/** True when Notion's KaTeX build cannot render this — see the note at the top of the file. */
export function needsPicture(latex: string): boolean {
  return latex.includes('\\ce{') || latex.includes('\\pu{');
}

export interface NotionMapping {
  blocks: NotionBlock[];
  /** Blocks whose pictures must be uploaded and spliced in, in document order. */
  images: NotionImageRef[];
}

/**
 * The whole document, as blocks.
 *
 * A `figure`, a `diagram`, a `structure` and an mhchem formula all become an `image` placeholder
 * carrying its block id; `notion-push` uploads the bytes and rewrites those entries. Doing it in
 * two passes keeps this function pure, which is what makes it testable.
 */
export function toNotionBlocks(model: ExportModel, backlink: string): NotionMapping {
  const blocks: NotionBlock[] = [];
  const images: NotionImageRef[] = [];

  if (model.breadcrumb) {
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: plain(model.breadcrumb), color: 'gray' },
    });
  }

  if (model.summary) {
    blocks.push(heading(2, 'In one paragraph'), paragraph(model.summary));
  }

  if (model.objectives.length) {
    blocks.push(heading(2, 'What you should be able to do'));
    for (const line of model.objectives) {
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: rich(line) },
      });
    }
  }

  for (const section of model.sections) sectionInto(section, blocks, images);

  if (model.endnotes.length) {
    blocks.push(divider(), heading(2, 'Notes'));
    for (const note of model.endnotes) {
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          icon: { type: 'emoji', emoji: MARGIN_ICONS[note.kind] ?? '📝' },
          rich_text: rich(`${note.number}. ${note.text}`),
        },
      });
    }
  }

  // 06 §3 asks for these as toggles, and 06 §5 says they ship whatever else is turned off. A
  // toggle is right here and nowhere else: on a long Notion page the appendices are reference
  // material, and collapsing them keeps the lesson readable without hiding anything.
  if (model.corrections.length) {
    blocks.push(
      toggle('Corrections — what to relearn', '📝', [
        ...model.corrections.flatMap((correction) => [
          paragraph(`**${correction.corrected}**`),
          paragraph(`You had: ${correction.original}`, 'gray'),
          ...(correction.why.trim() ? [paragraph(correction.why, 'gray')] : []),
        ]),
      ]),
    );
  }

  if (model.openQuestions.length) {
    blocks.push(
      toggle('Open questions — confirm these', '❓', [
        ...model.openQuestions.flatMap((question) => [
          paragraph(`**${question.question}**`),
          ...(question.why.trim() ? [paragraph(question.why, 'gray')] : []),
        ]),
      ]),
    );
  }

  if (model.glossary.length) {
    blocks.push(
      toggle('Glossary', '📖', [
        ...model.glossary.map((entry) => paragraph(`**${entry.term}** — ${entry.definition}`)),
      ]),
    );
  }

  if (model.flashcards.length) {
    blocks.push(
      toggle(`Flashcards (${model.flashcards.length})`, '🗂️', [
        ...model.flashcards.map((card) => paragraph(`**${card.front}** — ${card.back}`)),
      ]),
    );
  }

  blocks.push(divider());
  blocks.push({
    object: 'block',
    type: 'paragraph',
    paragraph: {
      color: 'gray',
      rich_text: [
        { type: 'text', text: { content: `${EXPORT_DISCLAIMER} ` } },
        { type: 'text', text: { content: 'Open in Lumen', link: { url: backlink } } },
      ],
    },
  });

  return { blocks, images };
}

function toggle(title: string, emoji: string, children: NotionBlock[]): NotionBlock {
  return {
    object: 'block',
    type: 'toggle',
    toggle: {
      rich_text: plain(title),
      icon: { type: 'emoji', emoji },
      // Notion caps children per request; the push splits a long toggle rather than losing the end.
      children: children.slice(0, MAX_CHILDREN),
    },
  };
}

function sectionInto(
  section: ExportSection,
  blocks: NotionBlock[],
  images: NotionImageRef[],
): void {
  blocks.push(heading(section.level === 2 ? 1 : 2, section.title));
  for (const row of section.blocks) blockInto(row, blocks, images);
}

function image(row: ExportBlock, caption: string, images: NotionImageRef[]): NotionBlock {
  const blockId = row.block.id ?? '';
  images.push({ blockId, caption });
  // A placeholder: `notion-push` replaces `external.url` with the uploaded file id. It is not a
  // usable block as it stands, which is deliberate — a half-mapped image should fail loudly in a
  // test rather than quietly publish a broken link.
  return {
    object: 'block',
    type: 'image',
    image: {
      type: 'external',
      external: { url: `lumen:pending:${blockId}` },
      caption: plain(caption),
    },
  };
}

function blockInto(row: ExportBlock, blocks: NotionBlock[], images: NotionImageRef[]): void {
  const { block } = row;
  const colour = row.origin && row.origin !== 'student' ? ORIGIN_COLOUR[row.origin] : undefined;
  const marker = row.endnotes.length ? ` [${row.endnotes.join('] [')}]` : '';

  switch (block.type) {
    case 'paragraph':
      blocks.push(paragraph(`${block.text}${marker}`, colour));
      return;

    case 'list':
      for (const item of block.items) {
        const type = block.ordered ? 'numbered_list_item' : 'bulleted_list_item';
        blocks.push({ object: 'block', type, [type]: { rich_text: rich(item, colour) } });
      }
      return;

    case 'definition':
      blocks.push({
        object: 'block',
        type: 'callout',
        callout: {
          icon: { type: 'emoji', emoji: CALLOUT_ICONS.definition! },
          rich_text: rich(`**${block.term}** — ${block.definition}`, colour),
        },
      });
      return;

    case 'formula': {
      // See the note at the top: mhchem is not in Notion's KaTeX build.
      if (needsPicture(block.latex)) blocks.push(image(row, block.useWhen || 'Formula', images));
      else {
        blocks.push({
          object: 'block',
          type: 'equation',
          equation: { expression: block.latex },
        });
      }
      for (const variable of block.where) {
        blocks.push({
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: rich(`$${variable.symbol}$ — ${variable.meaning} (${variable.units})`),
            color: 'gray',
          },
        });
      }
      if (block.useWhen) blocks.push(paragraph(`*Use when:* ${block.useWhen}`, 'gray'));
      return;
    }

    case 'workedExample': {
      blocks.push(paragraph(`**Worked example.** ${block.problem}`, colour));
      for (const step of block.steps) {
        blocks.push({
          object: 'block',
          type: 'numbered_list_item',
          numbered_list_item: { rich_text: rich(step.text) },
        });
        if (step.latex && !needsPicture(step.latex)) {
          blocks.push({ object: 'block', type: 'equation', equation: { expression: step.latex } });
        } else if (step.latex) {
          blocks.push({
            object: 'block',
            type: 'code',
            code: { language: 'latex', rich_text: plain(step.latex) },
          });
        }
      }
      blocks.push({
        object: 'block',
        type: 'callout',
        callout: {
          icon: { type: 'emoji', emoji: '✅' },
          rich_text: rich(`**Answer:** ${block.answerLatex ?? block.answer}`),
        },
      });
      if (block.commonMistake)
        blocks.push(paragraph(`*Common mistake:* ${block.commonMistake}`, 'gray'));
      return;
    }

    case 'callout':
      blocks.push({
        object: 'block',
        type: 'callout',
        callout: {
          icon: { type: 'emoji', emoji: CALLOUT_ICONS[block.kind] ?? '💡' },
          rich_text: rich(block.title ? `**${block.title}** ${block.text}` : block.text, colour),
        },
      });
      return;

    case 'misconception':
      blocks.push({
        object: 'block',
        type: 'callout',
        callout: {
          icon: { type: 'emoji', emoji: '⚠️' },
          color: 'orange_background',
          rich_text: rich(`**Not quite:** ${block.wrong}\n**Actually:** ${block.right}`),
        },
      });
      return;

    case 'table':
      blocks.push({
        object: 'block',
        type: 'table',
        table: {
          table_width: block.columns.length,
          has_column_header: true,
          has_row_header: false,
          children: [
            row_(block.columns.map((column) => column.header)),
            ...block.rows.slice(0, MAX_CHILDREN - 1).map((cells) => row_(cells)),
          ],
        },
      });
      if (block.caption) blocks.push(paragraph(`*${block.caption}*`, 'gray'));
      return;

    case 'structure':
      // The SMILES is the data and 06 §3 asks for it as code; the picture is what a reader sees.
      blocks.push({
        object: 'block',
        type: 'code',
        code: { language: 'plain text', rich_text: plain(block.smiles) },
      });
      blocks.push(image(row, block.caption, images));
      return;

    case 'diagram':
    case 'figure':
      blocks.push(image(row, block.caption, images));
      return;
  }
}

function row_(cells: string[]): NotionBlock {
  return {
    object: 'block',
    type: 'table_row',
    table_row: { cells: cells.map((cell) => rich(cell)) },
  };
}

/** Splits a list of blocks into requests Notion will accept. */
export function batches<T>(items: T[], size = MAX_CHILDREN): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}
