#!/usr/bin/env node
/**
 * Curriculum pack validator.
 *
 *   pnpm pack:validate                       # every pack in lib/curriculum/packs/
 *   pnpm pack:validate path/to/pack.json …   # specific files
 *
 * Phase-00 does schema checking only. Phase-05 adds the content lints (token budget for the
 * rendered block, duplicate topic ids, prose that looks copied from a syllabus).
 */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const schemaPath = join(root, 'lib/curriculum/pack.schema.json');
const packsDir = join(root, 'lib/curriculum/packs');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

async function targets() {
  const args = process.argv.slice(2);
  if (args.length > 0) return args.map((a) => resolve(process.cwd(), a));
  if (!existsSync(packsDir)) return [];
  const entries = await readdir(packsDir);
  return entries.filter((f) => f.endsWith('.json')).map((f) => join(packsDir, f));
}

async function main() {
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const applyFormats = addFormats.default ?? addFormats;
  applyFormats(ajv);
  const validate = ajv.compile(schema);

  const files = await targets();
  if (files.length === 0) {
    console.log(dim('No packs to validate (lib/curriculum/packs/ is empty).'));
    return;
  }

  let failed = 0;

  for (const file of files) {
    const label = relative(root, file) || basename(file);
    let pack;
    try {
      pack = JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      failed++;
      console.error(`${red('✗')} ${label}\n    not valid JSON: ${error.message}`);
      continue;
    }

    // `$schema` is an editor affordance in authored packs, not part of the pack contract.
    const { $schema: _ignored, ...body } = pack;

    if (validate(body)) {
      const units = body.units?.length ?? 0;
      const topics = (body.units ?? []).reduce((n, u) => n + (u.topics?.length ?? 0), 0);
      console.log(`${green('✓')} ${label} ${dim(`— ${units} unit(s), ${topics} topic(s)`)}`);
      continue;
    }

    failed++;
    console.error(`${red('✗')} ${label}`);
    for (const err of validate.errors ?? []) {
      const where = err.instancePath || '/';
      const extra = err.params?.allowedValues
        ? ` (allowed: ${err.params.allowedValues.join(', ')})`
        : err.params?.additionalProperty
          ? ` ('${err.params.additionalProperty}')`
          : '';
      console.error(`    ${where} ${err.message}${extra}`);
    }
  }

  if (failed > 0) {
    console.error(`\n${red(`${failed} pack(s) failed validation.`)}`);
    process.exit(1);
  }
  console.log(dim(`\n${files.length} pack(s) valid.`));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
