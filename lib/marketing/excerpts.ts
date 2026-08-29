import { RAW_FIXTURE_MARKDOWN } from '@/lib/render/fixture/raw-source';

/**
 * The hero's left-hand panel shows the student's actual notes (03-DESIGN.md §8.1), so it slices
 * them out of the fixture at runtime rather than restating them.
 *
 * Restating would be the easy version and it would rot: someone tidies a line in the fixture, the
 * landing page keeps showing the old one, and the page's central claim — "this is a real file" —
 * quietly stops being true. Slicing makes that impossible.
 *
 * This module is server-only. The fixture is 3 KB of markdown that belongs in the HTML, not in the
 * browser's JavaScript.
 */
function slice(from: string, to: string): string {
  const start = RAW_FIXTURE_MARKDOWN.indexOf(from);
  const end = RAW_FIXTURE_MARKDOWN.indexOf(to, start + from.length);

  if (start === -1 || end === -1) {
    throw new Error(
      `The raw fixture no longer contains "${from}" … "${to}". The marketing hero quotes it ` +
        'literally, so run `pnpm fixtures:build` and re-check lib/marketing/excerpts.ts.',
    );
  }

  return RAW_FIXTURE_MARKDOWN.slice(start, end).trimEnd();
}

/** Topic 1.1 as the student wrote it — the passage the hero wipes into its finished form. */
export const HERO_RAW_EXCERPT = slice('## 1.1', '## 1.2');

/** The very last line of the file, which stops mid-example. */
export const CUT_OFF_LINE = 'Given the empirical formula C5H7N, molar mass 162.26 g/mol';

/** A line of the raw notes, split for rendering as loose handwritten-looking lines. */
export function excerptLines(excerpt: string): string[] {
  return excerpt.split('\n');
}
