import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ValidateFunction } from 'ajv';

/**
 * The pack schema is the contract community authors write against (05-CURRICULUM-PACKS.md §2),
 * so it has to reject the mistakes they will actually make — not just accept the template.
 */
const ROOT = resolve(import.meta.dirname, '../..');
const schema = JSON.parse(readFileSync(resolve(ROOT, 'lib/curriculum/pack.schema.json'), 'utf8'));

interface MutablePack {
  [key: string]: unknown;
  units: { topics: Record<string, unknown>[] }[];
}

const template: MutablePack = (() => {
  const raw = JSON.parse(
    readFileSync(resolve(ROOT, 'curriculum-authoring/pack.template.json'), 'utf8'),
  ) as MutablePack;
  delete raw.$schema;
  return raw;
})();

let validate: ValidateFunction;

beforeAll(() => {
  validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
});

function check(mutate: (pack: MutablePack) => void) {
  const pack: MutablePack = structuredClone(template);
  mutate(pack);
  return validate(pack);
}

describe('pack schema', () => {
  it('accepts the authoring template', () => {
    expect(validate(template), JSON.stringify(validate.errors)).toBe(true);
  });

  it('requires an id, a curriculum, and at least one unit', () => {
    expect(check((p) => delete p.id)).toBe(false);
    expect(check((p) => delete p.curriculum)).toBe(false);
    expect(check((p) => (p.units = []))).toBe(false);
  });

  it('rejects an id that is not kebab-case', () => {
    expect(check((p) => (p.id = 'AP Chemistry'))).toBe(false);
    expect(check((p) => (p.id = 'ap-chemistry'))).toBe(true);
  });

  it('rejects a curriculum outside the app-wide enum', () => {
    expect(check((p) => (p.curriculum = 'SAT'))).toBe(false);
  });

  it('rejects a domain family the prompt has no template for', () => {
    expect(check((p) => (p.domainFamily = 'sports'))).toBe(false);
  });

  it('requires the fields that actually ground the model', () => {
    const topic = (p: MutablePack) => p.units[0]!.topics[0]!;
    expect(check((p) => delete topic(p).requiredDepth)).toBe(false);
    expect(check((p) => delete topic(p).mustDefine)).toBe(false);
    expect(check((p) => (topic(p).mustDefine = []))).toBe(false);
    expect(topic(template).requiredDepth).toBeTruthy();
  });

  it('rejects unknown top-level keys, so a typo is caught rather than ignored', () => {
    expect(check((p) => (p.units_ = []))).toBe(false);
  });

  it('requires a version of the form YYYY.N', () => {
    expect(check((p) => (p.version = '1.0'))).toBe(false);
    expect(check((p) => (p.version = '2026.2'))).toBe(true);
  });
});
