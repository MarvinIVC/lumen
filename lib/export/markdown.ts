/**
 * `ExportModel` → GitHub-flavoured Markdown (06 §2).
 *
 * Pure and synchronous: it takes the rasters it needs rather than making them, so the whole
 * serialiser is a unit test rather than a browser one. `bundle.ts` turns the result into the zip.
 *
 * The target is Obsidian, which decides three things here. Maths is `$…$` and `$$…$$`, because
 * that is what its MathJax reads and `\ce{}` comes with it. Mermaid goes in a ```mermaid fence,
 * which Obsidian renders natively — a PNG would be a picture of a diagram it can already draw.
 * And images are relative links into an adjacent `assets/` folder, because Obsidian resolves
 * those inside a vault and absolute ones only work until the link expires.
 */
import type { Origin } from '@/lib/ai/schema';

import { markdownFrom, toMarkdown, toPlainText, tokensFor } from './inline';
import { EXPORT_DISCLAIMER } from './types';
import type { ExportBlock, ExportModel, ExportSection, RasterAsset } from './types';

/** Where a raster lives inside the bundle, given the block that produced it. */
export function assetPath(blockId: string): string {
  return `assets/${blockId}.png`;
}

/**
 * The provenance marks, as one character each (06 §2's "include provenance marks" toggle).
 *
 * A tag line under every block would double the length of a mostly-rebuilt document, and an HTML
 * comment would be invisible — which is the one thing a provenance mark may not be. A superscript
 * letter is legible in a plain-text editor, survives a copy-paste into anything, and the legend
 * that explains it is written once at the top.
 */
const MARKS: Record<Exclude<Origin, 'student'>, string> = {
  'ai-added': 'ᴬ',
  'ai-clarified': 'ᶜ',
  'ai-corrected': 'ᴿ',
};

function mark(origin: Origin | null): string {
  return origin && origin !== 'student' ? ` ${MARKS[origin]}` : '';
}

export function toMarkdownDocument(model: ExportModel, rasters: Map<string, RasterAsset>): string {
  const out: string[] = [];

  out.push(`# ${toPlainText(model.title)}`);
  if (model.breadcrumb) out.push(`*${model.breadcrumb}*`);

  if (model.options.includeProvenance) {
    out.push(
      `> ${MARKS['ai-added']} added by Lumen · ${MARKS['ai-clarified']} clarified · ` +
        `${MARKS['ai-corrected']} corrected. Everything unmarked is yours.`,
    );
  }

  if (model.summary) {
    out.push('## In one paragraph', toMarkdown(model.summary));
  }

  if (model.objectives.length) {
    out.push(
      '## What you should be able to do',
      model.objectives.map((line) => `- ${toMarkdown(line)}`).join('\n'),
    );
  }

  for (const section of model.sections) out.push(...sectionOf(section, rasters));

  if (model.endnotes.length) {
    out.push(
      '## Notes',
      model.endnotes
        .map((note) => `${note.number}. ${toMarkdown(note.text)}${mark(note.origin)}`)
        .join('\n'),
    );
  }

  // 06 §5: both appendices ship whatever the toggles say. They are the reason the document can be
  // trusted, and a study guide that quietly drops them is a different document.
  if (model.corrections.length) {
    out.push(
      '## Corrections',
      model.corrections
        .map((correction) =>
          [
            `- **${toMarkdown(correction.corrected)}**`,
            `  - You had: ${toMarkdown(correction.original)}`,
            // An absent `why` leaves a bare bullet, which reads as a missing explanation rather
            // than as a correction that needed none.
            ...(correction.why.trim() ? [`  - Why: ${toMarkdown(correction.why)}`] : []),
          ].join('\n'),
        )
        .join('\n'),
    );
  }

  if (model.openQuestions.length) {
    out.push(
      '## Open questions',
      model.openQuestions
        .map((question) =>
          [
            `- ${toMarkdown(question.question)}`,
            ...(question.why.trim() ? [`  - ${toMarkdown(question.why)}`] : []),
          ].join('\n'),
        )
        .join('\n'),
    );
  }

  if (model.glossary.length) {
    out.push(
      '## Glossary',
      model.glossary
        .map((entry) => `- **${toMarkdown(entry.term)}** — ${toMarkdown(entry.definition)}`)
        .join('\n'),
    );
  }

  if (model.furtherStudy.length) {
    out.push('## Study next', model.furtherStudy.map((line) => `- ${toMarkdown(line)}`).join('\n'));
  }

  if (model.flashcards.length) {
    out.push(
      '## Flashcards',
      model.flashcards
        .map((card) => `- **${toMarkdown(card.front)}** :: ${toMarkdown(card.back)}`)
        .join('\n'),
    );
  }

  if (model.quiz.length) {
    out.push(
      '## Quiz',
      model.quiz
        .map((item, index) => {
          const lines = [`${index + 1}. ${toMarkdown(item.prompt)}`];
          for (const choice of item.choices ?? []) lines.push(`   - ${toMarkdown(choice)}`);
          lines.push(`   - **Answer:** ${toMarkdown(item.answer)}`);
          // An empty explanation would otherwise leave a bare bullet, which reads as a missing
          // item rather than as an absent one.
          if (item.explanation.trim()) lines.push(`   - ${toMarkdown(item.explanation)}`);
          return lines.join('\n');
        })
        .join('\n\n'),
    );
  }

  out.push('---', colophon(model));

  return `${out.join('\n\n')}\n`;
}

function colophon(model: ExportModel): string {
  const made = model.model ? `Rebuilt with ${model.model}. ` : '';
  return `*${made}${EXPORT_DISCLAIMER}*`;
}

function sectionOf(section: ExportSection, rasters: Map<string, RasterAsset>): string[] {
  const out = [`${'#'.repeat(section.level)} ${toPlainText(section.title)}`];
  for (const row of section.blocks) {
    const rendered = blockOf(row, rasters);
    if (rendered) out.push(rendered);
  }
  return out;
}

/** Superscript endnote markers, appended to whatever the block rendered to. */
function endnotes(row: ExportBlock): string {
  return row.endnotes.length ? ` [^${row.endnotes.join('] [^')}]` : '';
}

function blockOf(row: ExportBlock, rasters: Map<string, RasterAsset>): string {
  const { block, origin } = row;
  const tail = `${mark(origin)}${endnotes(row)}`;

  switch (block.type) {
    case 'paragraph':
      return `${toMarkdown(block.text)}${tail}`;

    case 'list': {
      const items = block.items.map(
        (item, index) => `${block.ordered ? `${index + 1}.` : '-'} ${toMarkdown(item)}`,
      );
      return `${items.join('\n')}${tail}`;
    }

    case 'definition':
      return `**${toMarkdown(block.term)}** — ${toMarkdown(block.definition)}${tail}`;

    case 'formula': {
      const lines = [`$$${block.latex}$$`];
      if (block.where.length) {
        lines.push(
          block.where
            .map((v) => `- $${v.symbol}$ — ${toMarkdown(v.meaning)} (${toMarkdown(v.units)})`)
            .join('\n'),
        );
      }
      if (block.useWhen) lines.push(`*Use when:* ${toMarkdown(block.useWhen)}`);
      return `${lines.join('\n\n')}${tail}`;
    }

    case 'workedExample': {
      const lines = [`**Worked example.** ${toMarkdown(block.problem)}`];
      block.steps.forEach((step, index) => {
        lines.push(`${index + 1}. ${toMarkdown(step.text)}`);
        if (step.latex) lines.push(`   $$${step.latex}$$`);
      });
      // The renderer shows `answerLatex` *instead of* `answer` — the plain form is its screen-reader
      // text — and emitting both put "$\\ce{C10H14N2}$ C10H14N2" in the file.
      lines.push(
        `**Answer:** ${block.answerLatex ? `$${block.answerLatex}$` : toMarkdown(block.answer)}`,
      );
      if (block.commonMistake) lines.push(`*Common mistake:* ${toMarkdown(block.commonMistake)}`);
      return `${lines.join('\n\n')}${tail}`;
    }

    case 'diagram': {
      // Mermaid stays as source — Obsidian draws it, and a picture of a diagram cannot be edited.
      // A chart has no text form, so it goes out as the raster.
      if (block.engine === 'mermaid' && block.source) {
        return `\`\`\`mermaid\n${block.source}\n\`\`\`\n\n*${toMarkdown(block.caption)}*${tail}`;
      }
      return image(row, rasters, block.alt, block.caption, tail);
    }

    case 'structure': {
      // Both, deliberately: the SMILES is the data and the PNG is what a reader sees.
      const picture = image(row, rasters, block.alt, block.caption, tail);
      return `\`\`\`smiles\n${block.smiles}\n\`\`\`\n\n${picture}`;
    }

    case 'figure':
      return image(row, rasters, block.alt, block.caption, tail);

    case 'callout': {
      const title = block.title ? `**${toMarkdown(block.title)}**\n> \n> ` : '';
      const body = toMarkdown(block.text).split('\n').join('\n> ');
      return `> ${title}${body}${tail}`;
    }

    case 'misconception':
      return [
        `> **Not quite:** ${toMarkdown(block.wrong)}`,
        `> `,
        `> **Actually:** ${toMarkdown(block.right)}${tail}`,
      ].join('\n');

    case 'table': {
      const header = `| ${block.columns.map((c) => toMarkdown(c.header)).join(' | ')} |`;
      const rule = `| ${block.columns.map((c) => (c.numeric ? '---:' : '---')).join(' | ')} |`;
      const rows = block.rows.map(
        (cells) => `| ${cells.map((cell) => cellOf(cell)).join(' | ')} |`,
      );
      const caption = block.caption ? `\n\n*${toMarkdown(block.caption)}*` : '';
      return `${[header, rule, ...rows].join('\n')}${caption}${tail}`;
    }
  }
}

/**
 * A pipe inside a cell ends the cell, and `\|` is the closest thing to a convention GFM readers
 * agree on.
 *
 * The lookbehind is load-bearing: `escapeMarkdown` has already escaped the pipes in *text*, and
 * escaping them twice puts a literal backslash in the student's table. What it has not escaped are
 * the pipes inside a maths or code token, which are emitted raw — and one of those ends the cell
 * just as effectively.
 */
function cellOf(cell: string): string {
  return markdownFrom(tokensFor(cell)).replace(/(?<!\\)\|/g, '\\|');
}

function image(
  row: ExportBlock,
  rasters: Map<string, RasterAsset>,
  alt: string,
  caption: string,
  tail: string,
): string {
  const id = row.block.id;
  const raster = id ? rasters.get(id) : undefined;
  const label = row.figureNumber ? `Figure ${row.figureNumber}. ` : '';
  const text = `*${label}${toMarkdown(caption)}*${tail}`;
  // A visual that could not be rasterised keeps its caption and its alt text rather than leaving a
  // hole: the reader still learns what was meant to be there.
  if (!raster || !id) return `${text}\n\n> Image unavailable — ${toMarkdown(alt)}`;
  return `![${toPlainText(alt)}](${assetPath(id)})\n\n${text}`;
}
