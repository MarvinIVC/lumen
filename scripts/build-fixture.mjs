/**
 * Bakes fixtures/ap-chem-u1-gold.md into a TypeScript module.
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
const source = readFileSync(resolve(root, 'fixtures/ap-chem-u1-gold.md'), 'utf8');
const target = resolve(root, 'lib/render/fixture/gold-source.ts');

const banner = `/**
 * GENERATED — do not edit. Run \`pnpm fixtures:build\` to regenerate from
 * fixtures/ap-chem-u1-gold.md, which is the file to change.
 */
`;

writeFileSync(target, `${banner}export const GOLD_FIXTURE_MARKDOWN = ${JSON.stringify(source)};\n`);
console.log(`Wrote ${target} (${source.length} chars)`);
