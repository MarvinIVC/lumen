import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The heavy renderers stay out of every static bundle (02-ARCHITECTURE.md §8, 06 §1).
 *
 * KaTeX, Mermaid, smiles-drawer and paged.js are together several hundred kilobytes, and a note
 * with no maths, no diagram and no structure should pay for none of it. One static `import` is
 * all it takes to undo that, and the damage is invisible until someone reads the build stats — so
 * it is asserted here instead.
 */

const ROOT = resolve(import.meta.dirname, '../..');

const DEFERRED = [
  'katex',
  'mermaid',
  'smiles-drawer',
  'pagedjs',
  // Phase-03's parsers. Together they are over a megabyte, and a student who pastes their notes
  // into the textarea should download none of it. Same rule, same one-loader-per-library shape:
  // `lib/ingest/loaders.ts`.
  'mammoth',
  'pdfjs-dist',
  'heic2any',
];

/** `import type` is erased at compile time and ships nothing. */
const STATIC_IMPORT = (pkg: string) =>
  new RegExp(String.raw`^\s*import\s+(?!type\b)[^;]*?from\s+['"]${pkg}(/[^'"]*)?['"]`, 'm');

const DYNAMIC_IMPORT = (pkg: string) =>
  new RegExp(String.raw`import\(\s*['"]${pkg}(/[^'"]*)?['"]\s*\)`);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

const sources = ['app', 'components', 'lib']
  .flatMap((dir) => walk(resolve(ROOT, dir)))
  .map((file) => relative(ROOT, file));

describe.each(DEFERRED)('%s', (pkg) => {
  it('is never imported statically', () => {
    const offenders = sources.filter((file) =>
      STATIC_IMPORT(pkg).test(readFileSync(resolve(ROOT, file), 'utf8')),
    );
    expect(
      offenders,
      `Import ${pkg} with await import('${pkg}') so it lands in its own async chunk.`,
    ).toEqual([]);
  });

  it('is reachable through exactly one dynamic import', () => {
    // One loader per library, memoised, so two diagrams on a page do not fetch the chunk twice
    // and so there is one place to change how it is themed.
    const loaders = sources.filter((file) =>
      DYNAMIC_IMPORT(pkg).test(readFileSync(resolve(ROOT, file), 'utf8')),
    );
    expect(loaders, `${pkg} should have exactly one loader module`).toHaveLength(1);
  });
});

/**
 * `docx` reaches the browser through exactly one door (phase-07 §2).
 *
 * Same shape as the editor rule below and for the same reason: an `await import()` is not
 * available here, because the library runs inside a Web Worker whose entry module is its own
 * chunk. So the guarantee is structural instead — `docx` is imported by the worker and by the
 * document builder it calls, and nothing else may import either of them.
 *
 * Both halves fail differently. A `docx` import anywhere else puts ~600 KB in the bundle of a
 * student who never exports anything. An import of the builder from a client component drags the
 * same 600 KB in through the back door, and — because `next.config.ts` aliases `docx` to `false`
 * in the server compilation — either breaks the build on a missing module or gets "fixed" by
 * removing the alias, which is the phase-03 trap with a different library.
 */
describe('the Word export', () => {
  const DOCX = /^\s*import\s+(?!type\b)[^;]*?from\s+['"]docx['"]/m;
  const DOOR = ['lib/export/docx.worker.ts', 'lib/export/docx-document.ts'];

  it('has files to check', () => {
    for (const file of DOOR) expect(sources).toContain(file);
  });

  it('is imported only by the worker and the document builder', () => {
    const offenders = sources
      .filter((file) => !DOOR.includes(file))
      .filter((file) => DOCX.test(readFileSync(resolve(ROOT, file), 'utf8')));

    expect(offenders, 'Import docx from lib/export/docx.worker.ts only.').toEqual([]);
  });

  it('is only entered by constructing the worker', () => {
    const importers = sources
      .filter((file) => !DOOR.includes(file))
      .map((file) => [file, readFileSync(resolve(ROOT, file), 'utf8')] as const)
      .filter(([, body]) =>
        body
          .split('\n')
          .filter((line) => /['"]@?[./]*\/?(lib\/export\/)?docx(-document|\.worker)/.test(line))
          .some((line) => !/^\s*import\s+type\b/.test(line)),
      );

    for (const [file, body] of importers) {
      expect(body, `${file} must reach the Word export by constructing the worker`).toMatch(
        /new Worker\(\s*new URL\(\s*['"]\.\/docx\.worker\.ts['"]/,
      );
    }
  });
});

/**
 * TipTap and ProseMirror reach the browser through exactly one door (phase-05 §8).
 *
 * The other deferred libraries above have one loader module each and are pulled in with
 * `await import()`. The editor is a React component tree and cannot be, so the same guarantee is
 * enforced structurally instead: every TipTap import lives under `lib/editor/`, and `lib/editor/`
 * is only ever entered through a `next/dynamic({ ssr: false })` call.
 *
 * Both halves matter and they fail differently. A static import from outside `lib/editor/` puts
 * ~300 KB of ProseMirror in the bundle of a student who only ever reads their note. A `lib/editor/`
 * import that is *not* dynamic puts it back into the SSR compilation, where `next.config.ts`
 * aliases TipTap to `false` — so the build fails on a missing module, which is at least loud, or
 * the alias is removed to "fix" it and the Cloudflare Worker silently grows past its ceiling
 * again. That is the phase-03 trap with a different library.
 */
describe('the editor', () => {
  const TIPTAP = /^\s*import\s+(?!type\b)[^;]*?from\s+['"](@tiptap|prosemirror-)/m;

  const editorFiles = sources.filter((file) => file.startsWith('lib/editor/'));

  it('has files to check', () => {
    expect(editorFiles.length).toBeGreaterThan(0);
  });

  it('is the only place that imports TipTap or ProseMirror', () => {
    const offenders = sources
      .filter((file) => !file.startsWith('lib/editor/'))
      .filter((file) => TIPTAP.test(readFileSync(resolve(ROOT, file), 'utf8')));

    expect(
      offenders,
      'Import TipTap from lib/editor/ only, and reach lib/editor/ through next/dynamic.',
    ).toEqual([]);
  });

  it('is only entered through next/dynamic with ssr disabled', () => {
    const importers = sources
      .filter((file) => !file.startsWith('lib/editor/'))
      .map((file) => [file, readFileSync(resolve(ROOT, file), 'utf8')] as const)
      .filter(([, body]) => /['"]@\/lib\/editor\//.test(body));

    for (const [file, body] of importers) {
      // A type-only import is erased and ships nothing, so it is not a door.
      const valueImports = body
        .split('\n')
        .filter((line) => /['"]@\/lib\/editor\//.test(line))
        .filter((line) => !/^\s*import\s+type\b/.test(line));
      if (valueImports.length === 0) continue;

      expect(body, `${file} must reach lib/editor/ through next/dynamic({ ssr: false })`).toMatch(
        /dynamic\(\s*\(\)\s*=>\s*import\(\s*['"]@\/lib\/editor\//,
      );
      expect(body, `${file} must set ssr: false on that dynamic import`).toMatch(/ssr:\s*false/);
    }
  });
});
