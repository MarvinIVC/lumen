/**
 * Markdown and Anki, serialised (06 §2).
 *
 * Both are pure functions of the model, so the things that would only be visible after opening the
 * file in Obsidian or Anki — a pipe inside a table cell, a newline inside a card, `$` where a
 * MathJax delimiter belongs — are assertable here instead.
 */
import { describe, expect, it } from 'vitest';

import { ankiGuide, toAnkiCsv } from '@/lib/export/anki';
import { toMarkdownDocument } from '@/lib/export/markdown';
import { buildExportModel } from '@/lib/export/model';
import { DEFAULT_EXPORT_OPTIONS } from '@/lib/export/types';
import type { ExportModel, RasterAsset } from '@/lib/export/types';
import { goldFixture } from '@/lib/render/fixture/gold';
import type { NoteDocument } from '@/lib/ai/schema';

const NO_RASTERS = new Map<string, RasterAsset>();

function gold(overrides: Partial<Parameters<typeof buildExportModel>[1]> = {}): ExportModel {
  return buildExportModel(goldFixture(), { ...DEFAULT_EXPORT_OPTIONS, ...overrides });
}

describe('Markdown export', () => {
  const markdown = toMarkdownDocument(gold(), NO_RASTERS);

  it('opens with the title and the breadcrumb', () => {
    expect(markdown.startsWith('# ')).toBe(true);
    expect(markdown).toContain('*AP Chemistry · Unit 1 (Topics 1.1–1.4)*');
  });

  it('carries both appendices', () => {
    expect(markdown).toContain('## Corrections');
    expect(markdown).toContain('## Open questions');
  });

  it('keeps the standing disclaimer', () => {
    expect(markdown).toContain('it can still be wrong');
  });

  it('emits chemistry as $$…$$ so Obsidian renders it', () => {
    expect(markdown).toMatch(/\$\$[^$]*\\ce\{/);
  });

  it('puts a mermaid diagram in a fence rather than making a picture of it', () => {
    const doc = goldFixture();
    const hasMermaid = doc.sections.some((section) =>
      section.blocks.some((block) => block.type === 'diagram' && block.engine === 'mermaid'),
    );
    expect(hasMermaid).toBe(true);
    expect(markdown).toContain('```mermaid');
  });

  it('escapes a pipe inside a table cell instead of ending the cell', () => {
    const doc: NoteDocument = {
      ...goldFixture(),
      sections: [
        {
          id: 's-1',
          title: 'Table',
          level: 2,
          blocks: [
            {
              type: 'table',
              origin: 'ai-added',
              id: 'b-1',
              caption: 'Ranges',
              columns: [{ header: 'Symbol' }, { header: 'Meaning' }],
              rows: [['a | b', 'either']],
            },
          ],
        },
      ],
    };
    const out = toMarkdownDocument(buildExportModel(doc), NO_RASTERS);
    expect(out).toContain('| a \\| b | either |');
  });

  it('drops the provenance legend and the marks when provenance is off', () => {
    const withMarks = toMarkdownDocument(gold(), NO_RASTERS);
    const without = toMarkdownDocument(
      buildExportModel(goldFixture(), { includeStudyTools: true, includeProvenance: false }),
      NO_RASTERS,
    );
    expect(withMarks).toContain('added by Lumen');
    expect(without).not.toContain('added by Lumen');
    expect(without).not.toContain('ᴬ');
  });

  it('drops the flashcards and the quiz when study tools are off, but keeps the note', () => {
    const without = toMarkdownDocument(
      buildExportModel(goldFixture(), { includeStudyTools: false, includeProvenance: true }),
      NO_RASTERS,
    );
    expect(without).not.toContain('## Flashcards');
    expect(without).not.toContain('## Quiz');
    expect(without).toContain('## Corrections');
  });

  it('keeps a caption and the alt text where a figure could not be rasterised', () => {
    expect(markdown).toContain('Image unavailable —');
  });
});

describe('Anki export', () => {
  const csv = toAnkiCsv(gold());
  const lines = csv.split('\n');

  it('leads with the directives that configure Anki’s import dialog', () => {
    expect(lines[0]).toBe('#separator:tab');
    expect(lines).toContain('#html:true');
    expect(lines).toContain('#notetype:Basic');
    expect(lines).toContain('#tags column:3');
    expect(lines.find((line) => line.startsWith('#deck:'))).toContain('Lumen::AP Chemistry');
  });

  it('writes three tab-separated fields per card', () => {
    const rows = lines.filter((line) => line && !line.startsWith('#'));
    expect(rows.length).toBeGreaterThan(3);
    for (const row of rows) expect(row.split('\t')).toHaveLength(3);
  });

  it('uses MathJax delimiters, never $', () => {
    const rows = lines.filter((line) => line && !line.startsWith('#'));
    const body = rows.join('\n');
    expect(body).not.toMatch(/(?<!\\)\$/);
    if (body.includes('\\ce{')) expect(body).toMatch(/\\\(|\\\[/);
  });

  it('never lets a newline inside a card end the row', () => {
    const model = gold();
    const withBreak: ExportModel = {
      ...model,
      flashcards: [{ front: 'Line one\nline two', back: 'a\nb', sectionId: 's-1' }],
    };
    const rows = toAnkiCsv(withBreak)
      .split('\n')
      .filter((line) => line && !line.startsWith('#'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('Line one<br>line two');
  });

  it('tags every card with the course and unit, with no spaces', () => {
    const rows = lines.filter((line) => line && !line.startsWith('#'));
    const tags = rows[0]!.split('\t')[2]!;
    expect(tags).toContain('lumen');
    expect(tags).toContain('AP_Chemistry');
    expect(tags.split(' ').every((value) => !value.includes(' '))).toBe(true);
  });

  it('ships a guide naming the deck the cards will land in', () => {
    const guide = ankiGuide(gold());
    expect(guide).toContain('Lumen::AP Chemistry');
    expect(guide).toContain('File → Import');
  });
});
