/**
 * Bakes the two canonical fixtures into TypeScript modules.
 *
 * The fixture has to be readable from three places with three different module systems: Next's
 * server bundler, Storybook's Vite build, and Vitest. `fs` is not available in two of them and
 * `?raw` imports are not available in the third, so the portable answer is a generated .ts file
 * committed alongside the markdown. Run `pnpm fixtures:build` after editing the fixture.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The raw fixture is baked too, because the marketing hero and its "the problem" section quote it
 * literally (03-DESIGN.md §8.1–8.2) and a paraphrase would undercut the whole point of the page.
 * `tests/unit/marketing-excerpts.test.ts` asserts every quoted line is a substring of this.
 */
const FIXTURES = [
  {
    markdown: 'fixtures/ap-chem-u1-gold.md',
    module: 'lib/render/fixture/gold-source.ts',
    constant: 'GOLD_FIXTURE_MARKDOWN',
  },
  {
    markdown: 'fixtures/ap-chem-u1-raw.md',
    module: 'lib/render/fixture/raw-source.ts',
    constant: 'RAW_FIXTURE_MARKDOWN',
  },
];

for (const { markdown, module, constant } of FIXTURES) {
  const source = readFileSync(resolve(root, markdown), 'utf8');
  const target = resolve(root, module);

  const banner = `/**
 * GENERATED — do not edit. Run \`pnpm fixtures:build\` to regenerate from
 * ${markdown}, which is the file to change.
 */
`;

  writeFileSync(target, `${banner}export const ${constant} = ${JSON.stringify(source)};\n`);
  console.log(`Wrote ${target} (${source.length} chars)`);
}
