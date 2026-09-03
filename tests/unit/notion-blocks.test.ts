/**
 * `NoteDocument` → Notion blocks (06 §3).
 *
 * The mapping is pure, so everything that would otherwise only be visible by looking at a Notion
 * page — a chemistry equation rendering as a red error box, a table pushed as paragraphs, a
 * request Notion refuses for having 140 children — is assertable here.
 */
import { describe, expect, it } from 'vitest';

import {
  batches,
  MAX_CHILDREN,
  needsPicture,
  rich,
  toNotionBlocks,
} from '@/lib/integrations/notion-blocks';
import { buildExportModel } from '@/lib/export/model';
import { assignBlockIds } from '@/lib/ai/validate';
import { goldFixture } from '@/lib/render/fixture/gold';

const BACKLINK = 'https://lumen.example/app/note/abc';

function mapped() {
  return toNotionBlocks(buildExportModel(assignBlockIds(goldFixture())), BACKLINK);
}

describe('Notion blocks', () => {
  const { blocks, images } = mapped();
  const types = blocks.map((block) => block.type);

  it('uses real headings rather than bold paragraphs', () => {
    expect(types).toContain('heading_1');
    expect(types).toContain('heading_2');
  });

  it('sends a plain formula as an equation block, which Notion renders', () => {
    const equations = blocks.filter((block) => block.type === 'equation');
    expect(equations.length).toBeGreaterThan(0);
    for (const block of equations) {
      const expression = (block.equation as { expression: string }).expression;
      // Anything mhchem cannot survive must not have been sent as an equation.
      expect(needsPicture(expression)).toBe(false);
    }
  });

  it('sends a chemistry formula as a picture instead, because Notion has no mhchem', () => {
    // `\ce{}` in a Notion equation renders as a red error box: a broken page and no chemistry,
    // which is worse than a picture of the right thing.
    expect(needsPicture('\\ce{2H2 + O2 -> 2H2O}')).toBe(true);
    expect(needsPicture('n = \\dfrac{m}{M}')).toBe(false);
  });

  it('maps inline maths to Notion’s inline equation, not to characters', () => {
    const parts = rich('One mole is $6.022\\times10^{23}$ particles');
    expect(parts.some((part) => part.type === 'equation')).toBe(true);
    expect(parts.find((part) => part.type === 'equation')?.equation?.expression).toBe(
      '6.022\\times10^{23}',
    );
  });

  it('keeps bold and italic as annotations', () => {
    const parts = rich('**bold** and *italic*');
    expect(parts.some((part) => part.annotations?.bold)).toBe(true);
    expect(parts.some((part) => part.annotations?.italic)).toBe(true);
  });

  it('maps a table to a Notion table with a header row', () => {
    const table = blocks.find((block) => block.type === 'table');
    expect(table).toBeDefined();
    const body = table!.table as {
      table_width: number;
      has_column_header: boolean;
      children: unknown[];
    };
    expect(body.has_column_header).toBe(true);
    expect(body.table_width).toBeGreaterThan(1);
    expect(body.children.length).toBeGreaterThan(1);
  });

  it('collects every picture it could not inline, with a block id to upload against', () => {
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) expect(image.blockId).toBeTruthy();
    // The placeholder is deliberately not a usable URL: a half-mapped image should fail a test
    // rather than quietly publish a broken link.
    const placeholders = blocks.filter(
      (block) =>
        block.type === 'image' &&
        String((block.image as { external: { url: string } }).external.url).startsWith(
          'lumen:pending:',
        ),
    );
    expect(placeholders).toHaveLength(images.length);
  });

  it('puts the corrections and the open questions in toggles, and keeps them', () => {
    const toggles = blocks.filter((block) => block.type === 'toggle');
    const titles = toggles.map(
      (block) =>
        (block.toggle as { rich_text: { text?: { content: string } }[] }).rich_text[0]?.text
          ?.content ?? '',
    );
    expect(titles.some((title) => /Corrections/.test(title))).toBe(true);
    expect(titles.some((title) => /Open questions/.test(title))).toBe(true);
  });

  it('ends with a backlink to the note in Lumen', () => {
    const last = blocks.at(-1)!;
    const runs = (last.paragraph as { rich_text: { text?: { link?: { url: string } } }[] })
      .rich_text;
    expect(runs.some((run) => run.text?.link?.url === BACKLINK)).toBe(true);
  });

  it('never emits a request Notion would refuse for size', () => {
    // 100 children per request is a hard limit. The fixture happens to fit in one request, so the
    // chunker is proved on a document that does not — losing the tail of a long note is exactly
    // the failure this guards, and it would only show up on somebody's longest note.
    const many = Array.from({ length: 250 }, (_, index) => index);
    const chunks = batches(many);
    expect(chunks.length).toBe(3);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(MAX_CHILDREN);
    expect(chunks.flat()).toEqual(many);

    for (const chunk of batches(blocks)) expect(chunk.length).toBeLessThanOrEqual(MAX_CHILDREN);
    expect(batches(blocks).flat()).toHaveLength(blocks.length);

    for (const block of blocks) {
      const children = (block[block.type] as { children?: unknown[] })?.children;
      if (Array.isArray(children)) expect(children.length).toBeLessThanOrEqual(MAX_CHILDREN);
    }
  });

  it('splits a run of text longer than Notion’s per-item cap rather than truncating it', () => {
    const long = 'a'.repeat(5000);
    const parts = rich(long);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(part.text!.content.length).toBeLessThanOrEqual(2000);
    expect(parts.map((part) => part.text!.content).join('')).toHaveLength(5000);
  });
});

/**
 * Every block, checked against the properties Notion actually allows for its type.
 *
 * This exists because of a bug that shipped: the mapper put an `icon` on a `toggle` and on a
 * `bulleted_list_item`. `icon` is a property of `callout`, and of pages and databases, and of
 * nothing else — so Notion answered `body.children[N].toggle.icon should be not present` and
 * rejected the request. The append is one call, so a single invalid property loses the whole
 * document, and what the student saw was an empty page in their workspace and "that push did not
 * finish".
 *
 * An allow-list rather than a validator: the failure mode is emitting a property that reads
 * plausibly and is not in the schema, which is exactly what a hand-written allow-list catches and
 * what "does it have the required fields" does not.
 */
const ALLOWED: Record<string, string[]> = {
  paragraph: ['rich_text', 'color', 'children'],
  heading_1: ['rich_text', 'color', 'is_toggleable'],
  heading_2: ['rich_text', 'color', 'is_toggleable'],
  heading_3: ['rich_text', 'color', 'is_toggleable'],
  bulleted_list_item: ['rich_text', 'color', 'children'],
  numbered_list_item: ['rich_text', 'color', 'children'],
  toggle: ['rich_text', 'color', 'children'],
  callout: ['rich_text', 'icon', 'color', 'children'],
  code: ['rich_text', 'caption', 'language'],
  equation: ['expression'],
  divider: [],
  image: ['type', 'external', 'file', 'file_upload', 'caption'],
  table: ['table_width', 'has_column_header', 'has_row_header', 'children'],
  table_row: ['cells'],
};

describe('the Notion block schema', () => {
  function walk(blocks: ReturnType<typeof toNotionBlocks>['blocks'], path = 'root'): string[] {
    const problems: string[] = [];

    for (const [index, block] of blocks.entries()) {
      const where = `${path}[${index}] ${block.type}`;
      const allowed = ALLOWED[block.type];
      if (!allowed) {
        problems.push(`${where}: unknown block type`);
        continue;
      }

      const body = block[block.type] as Record<string, unknown> | undefined;
      for (const key of Object.keys(body ?? {})) {
        if (!allowed.includes(key)) problems.push(`${where}: '${key}' is not a property of it`);
      }

      const children = (body as { children?: unknown })?.children;
      if (Array.isArray(children)) {
        problems.push(...walk(children as ReturnType<typeof toNotionBlocks>['blocks'], where));
      }
    }

    return problems;
  }

  it('emits no property Notion does not have for that block type', () => {
    const { blocks } = mapped();
    expect(walk(blocks)).toEqual([]);
  });

  it('keeps the icon on the one block that takes one', () => {
    const { blocks } = mapped();
    const callouts = blocks.filter((block) => block.type === 'callout');
    expect(callouts.length).toBeGreaterThan(0);
    expect(callouts.every((block) => 'icon' in (block.callout as object))).toBe(true);
  });

  it('puts the emoji in the text where the block cannot carry one', () => {
    const { blocks } = mapped();
    const toggles = blocks.filter((block) => block.type === 'toggle');
    expect(toggles.length).toBeGreaterThan(0);
    for (const block of toggles) {
      const body = block.toggle as { rich_text: { text?: { content: string } }[] };
      expect(body.rich_text[0]?.text?.content).toMatch(/^\p{Extended_Pictographic}/u);
    }
  });
});
