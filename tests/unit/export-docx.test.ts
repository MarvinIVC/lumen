/**
 * The Word export, packed and read back (06 §2).
 *
 * `docx` runs in node, so the document is built and zipped here and the XML is inspected — which
 * catches the things that would otherwise only be visible after opening the file in Word: a
 * picture that never made it into the package, a table that came out as paragraphs, a comment
 * referenced by a body element that does not exist.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { Packer } from 'docx';
import { unzipSync, strFromU8 } from 'fflate';

import { buildDocxDocument } from '@/lib/export/docx-document';
import { buildExportModel } from '@/lib/export/model';
import { DEFAULT_EXPORT_OPTIONS } from '@/lib/export/types';
import type { RasterAsset } from '@/lib/export/types';
import { goldFixture } from '@/lib/render/fixture/gold';
import { assignBlockIds } from '@/lib/ai/validate';

/** A one-pixel PNG — enough to prove the embed path without a fixture file. */
const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);

function rasterFor(blockId: string): RasterAsset {
  return { blockId, png: PNG.buffer.slice(0) as ArrayBuffer, width: 800, height: 400, alt: 'a' };
}

async function pack(options = DEFAULT_EXPORT_OPTIONS, withRasters = true) {
  // As a real note arrives: the fixture parser mints section ids but not block ids, and every
  // document that reaches a renderer or an exporter has been through `migrateNoteDocument` first.
  // Without this the figures have no key, and every one of them takes the "unavailable" path.
  const model = buildExportModel(assignBlockIds(goldFixture()), options);
  const visuals = model.sections
    .flatMap((section) => section.blocks)
    .filter((row) => ['diagram', 'structure', 'figure'].includes(row.block.type));
  const rasters = new Map(
    withRasters ? visuals.map((row) => [row.block.id!, rasterFor(row.block.id!)]) : [],
  );
  const buffer = await Packer.toBuffer(buildDocxDocument(model, rasters));
  const files = unzipSync(new Uint8Array(buffer));
  return {
    model,
    visuals,
    files,
    document: strFromU8(files['word/document.xml']!),
    comments: files['word/comments.xml'] ? strFromU8(files['word/comments.xml']) : '',
    core: strFromU8(files['docProps/core.xml']!),
  };
}

describe('Word export', () => {
  let packed: Awaited<ReturnType<typeof pack>>;

  beforeAll(async () => {
    packed = await pack();
  });

  it('packs a valid OOXML package', () => {
    expect(Object.keys(packed.files)).toEqual(
      expect.arrayContaining(['[Content_Types].xml', 'word/document.xml', 'docProps/core.xml']),
    );
  });

  it('sets the document properties from the note', () => {
    expect(packed.core).toContain('Lumen');
    expect(packed.core).toContain('AP Chemistry');
  });

  it('writes headings as real heading styles, not as bold paragraphs', () => {
    expect(packed.document).toContain('w:val="Heading1"');
    expect(packed.document).toContain('w:val="Heading2"');
  });

  it('writes tables as real tables', () => {
    const hasTable = packed.model.sections.some((section) =>
      section.blocks.some((row) => row.block.type === 'table'),
    );
    expect(hasTable).toBe(true);
    expect(packed.document).toContain('<w:tbl>');
    expect(packed.document).toContain('<w:tc>');
  });

  it('places every rasterised figure as a picture in the package', () => {
    expect(packed.visuals.length).toBeGreaterThan(0);

    // One drawing per figure. Not one media file per figure: `docx` stores image bytes by content
    // hash, so figures that happen to be identical share a part — which is right, and is why
    // counting the files in `word/media/` would assert the wrong thing.
    const drawings = packed.document.match(/<w:drawing>/g) ?? [];
    expect(drawings).toHaveLength(packed.visuals.length);

    const media = Object.keys(packed.files).filter((name) => /^word\/media\/.+/.test(name));
    expect(media.length).toBeGreaterThan(0);
    expect(media.every((name) => name.endsWith('.png'))).toBe(true);
  });

  it('anchors a Word comment for every provenance mark, and defines each one', () => {
    const referenced = [...packed.document.matchAll(/w:commentReference w:id="(\d+)"/g)].map(
      (match) => match[1],
    );
    const defined = [...packed.comments.matchAll(/<w:comment [^>]*w:id="(\d+)"/g)].map(
      (match) => match[1],
    );
    expect(referenced.length).toBeGreaterThan(0);
    // A body element referring to a comment that was never defined is the failure that makes Word
    // report the document as corrupt, and it is invisible until you open it.
    for (const id of referenced) expect(defined).toContain(id);
  });

  it('writes no comments and no colour legend when provenance is off', async () => {
    const without = await pack({ includeStudyTools: true, includeProvenance: false });
    expect(without.document).not.toContain('w:commentReference');
    expect(without.document).not.toContain('Everything in black is yours');
  });

  it('keeps the corrections appendix when the study tools are off', async () => {
    const without = await pack({ includeStudyTools: false, includeProvenance: true });
    expect(without.document).toContain('what to relearn');
    expect(without.document).not.toContain('Flashcards');
  });

  it('keeps the caption and the alt text where a figure could not be rasterised', async () => {
    const bare = await pack(DEFAULT_EXPORT_OPTIONS, false);
    expect(Object.keys(bare.files).filter((n) => /^word\/media\/.+/.test(n))).toHaveLength(0);
    expect(bare.document).not.toContain('<w:drawing>');
    // The alt text of a structure the fixture carries, standing in for the picture.
    expect(bare.document).toContain('Figure');
  });

  it('carries the standing disclaimer', () => {
    expect(packed.document).toContain('it can still be wrong');
  });
});
