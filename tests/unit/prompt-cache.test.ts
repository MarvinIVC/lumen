import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { PROMPT_VERSION } from '@/lib/ai/versions';
import {
  DOMAIN_TEMPLATE_BLOCKS,
  RUBRIC_SYSTEM,
  SCHEMA_BLOCK,
  buildEnhancePrompt,
  buildRunInstruction,
} from '@/lib/ai/prompts';
import { buildPackBlock, genericBlock, matchPack } from '@/lib/curriculum/load';
import { staticPackSource } from '@/lib/curriculum/registry';
import type { BuildEnhancePromptInput } from '@/lib/ai/prompts';
import type { DomainFamily, NoteContext } from '@/lib/ai/schema';

/**
 * The cache boundary (04-AI-ENGINE.md §4.1).
 *
 * DeepSeek's prefix caching is automatic and invisible: it happens when the beginning of a prompt
 * is byte-identical to a recent one, and when it stops happening nothing changes except that input
 * costs about thirty-one times more. There is no error, no warning and no difference in the
 * output — which is why this file exists.
 *
 * The rule it enforces is negative. Nothing above the run instruction may vary per call: no
 * timestamp, no note id, no title, no filename, no locale-formatted date. `buildEnhancePrompt`
 * takes no clock and no id, and these tests are what stops one being added.
 */
const CONTEXT: NoteContext = {
  subject: 'Chemistry',
  curriculum: 'AP',
  course: 'AP Chemistry',
  unit: 'Unit 1 — Atomic Structure and Properties',
  topic: '1.1',
  language: 'en',
  domainFamily: 'stem-quantitative',
};

const OPTIONS = { mode: 'complete', depth: 'match', visuals: 'auto', voice: 'keep-mine' } as const;

async function packBlock() {
  const match = await matchPack(CONTEXT, staticPackSource);
  return match ? buildPackBlock(match) : genericBlock(CONTEXT);
}

function stablePrefix(prompt: ReturnType<typeof buildEnhancePrompt>): string {
  return [prompt.system, prompt.messages[0]?.content, prompt.messages[1]?.content].join(' ');
}

describe('the cached prefix', () => {
  it('is byte-identical for two different notes on the same lesson', async () => {
    const pack = await packBlock();
    const base: BuildEnhancePromptInput = {
      context: CONTEXT,
      options: OPTIONS,
      packBlock: pack,
      extract: '',
    };

    const first = buildEnhancePrompt({
      ...base,
      extract: 'Atomic mass = molar mass',
      titleHint: 'AP Chem U1',
    });
    const second = buildEnhancePrompt({
      ...base,
      extract: 'Completely different notes about isotopes and mass spectrometry.',
      titleHint: 'Isotopes lesson',
    });

    expect(stablePrefix(first)).toBe(stablePrefix(second));
  });

  it('is byte-identical across two calls a second apart', async () => {
    const pack = await packBlock();
    const input: BuildEnhancePromptInput = {
      context: CONTEXT,
      options: OPTIONS,
      packBlock: pack,
      extract: 'notes',
    };
    const first = stablePrefix(buildEnhancePrompt(input));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(stablePrefix(buildEnhancePrompt(input))).toBe(first);
  });

  it('puts everything volatile in the last message and nothing else', async () => {
    const pack = await packBlock();
    const prompt = buildEnhancePrompt({
      context: CONTEXT,
      options: OPTIONS,
      packBlock: pack,
      titleHint: 'A very specific title',
      extract: 'A very specific extract about mercury.',
    });
    const prefix = stablePrefix(prompt);
    const tail = String(prompt.messages[2]?.content ?? '');

    for (const volatile of ['A very specific title', 'A very specific extract', 'mercury']) {
      expect(prefix).not.toContain(volatile);
      expect(tail).toContain(volatile);
    }
  });

  it('changes when the lesson changes, and only then', async () => {
    const pack = await packBlock();
    const same = buildEnhancePrompt({
      context: CONTEXT,
      options: OPTIONS,
      packBlock: pack,
      extract: 'a',
    });

    const otherContext: NoteContext = { ...CONTEXT, unit: 'Unit 5 — Kinetics', topic: '5.1' };
    const otherMatch = await matchPack(otherContext, staticPackSource);
    const otherUnit = buildEnhancePrompt({
      context: otherContext,
      options: OPTIONS,
      packBlock: buildPackBlock(otherMatch),
      extract: 'a',
    });

    expect(stablePrefix(same)).not.toBe(stablePrefix(otherUnit));
  });

  it('reports the same prefix it actually sends', async () => {
    const pack = await packBlock();
    const prompt = buildEnhancePrompt({
      context: CONTEXT,
      options: OPTIONS,
      packBlock: pack,
      extract: 'a',
    });
    // `cachePrefix` is the hint providers with an explicit breakpoint (Anthropic) use, and it has
    // to describe the same bytes the OpenAI-compatible providers cache implicitly.
    expect(prompt.cachePrefix).toContain(RUBRIC_SYSTEM);
    expect(prompt.cachePrefix).toContain(pack.text);
    expect(prompt.cachePrefix).not.toContain('BEGIN STUDENT NOTES');
  });

  it('carries the options into the volatile tail, not the prefix', async () => {
    const pack = await packBlock();
    const input: BuildEnhancePromptInput = {
      context: CONTEXT,
      options: OPTIONS,
      packBlock: pack,
      extract: 'a',
    };
    const tidy = buildEnhancePrompt({ ...input, options: { ...OPTIONS, mode: 'tidy' } });
    expect(stablePrefix(tidy)).toBe(stablePrefix(buildEnhancePrompt(input)));
    expect(buildRunInstruction({ ...input, options: { ...OPTIONS, mode: 'tidy' } })).toContain(
      'mode=tidy',
    );
  });
});

/**
 * The version guard (§10).
 *
 * Every prompt string is hashed together. If the hash moves, a prompt changed, and a prompt change
 * requires bumping PROMPT_VERSION and re-running `pnpm test:ai` — because it invalidates the
 * provider's prefix cache and it invalidates every eval result taken before it.
 */
describe('prompt versioning', () => {
  const families = Object.keys(DOMAIN_TEMPLATE_BLOCKS).sort() as DomainFamily[];
  const hash = createHash('sha256')
    .update(RUBRIC_SYSTEM)
    .update(SCHEMA_BLOCK)
    .update(families.map((family) => DOMAIN_TEMPLATE_BLOCKS[family]).join(' '))
    .digest('hex')
    .slice(0, 16);

  it('has not changed a prompt without bumping PROMPT_VERSION', () => {
    expect(
      hash,
      [
        'A prompt string changed.',
        '',
        'That is fine, and it needs three things:',
        `  1. bump PROMPT_VERSION in lib/ai/versions.ts (currently ${PROMPT_VERSION})`,
        '  2. re-run `pnpm test:ai` — every eval result taken before the change is stale',
        `  3. update the expected hash in this test to ${hash}`,
        '',
        'It also invalidates the provider prefix cache, which is expected and fine.',
      ].join('\n'),
    ).toBe(EXPECTED_PROMPT_HASH);
  });

  it('states a version in the shape documents record', () => {
    expect(PROMPT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

/** Bumped together with PROMPT_VERSION. See the failure message above. */
const EXPECTED_PROMPT_HASH = '06bbb9f05cd6168c';
