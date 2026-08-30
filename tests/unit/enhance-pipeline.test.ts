import { describe, expect, it } from 'vitest';

import { runEnhance } from '@/lib/ai/enhance';
import type { PipelineEvent } from '@/lib/ai/enhance';
import type { BuildEnhancePromptInput } from '@/lib/ai/prompts';
import type { LLMProvider } from '@/lib/ai/provider';
import { chunked, createMockProvider } from '../ai-evals/mock-provider';

/**
 * The pipeline's recovery ladder (04 §8) is the part of this product that only ever runs when
 * something has already gone wrong, which is exactly why it needs tests: every branch here is one
 * a student hits on a bad day, and none of them may cost a credit or show a stack trace.
 */
const DOC = {
  title: 'Moles and Molar Mass',
  summary:
    'A short lesson on the mole as a count rather than a mass, and the conversions it enables between grams, moles and particles.',
  objectives: ['Convert mass to moles'],
  sections: [
    {
      id: 's-1',
      title: '1.1 The mole',
      level: 2,
      blocks: [
        { type: 'paragraph', origin: 'student', text: 'A mole is an amount.' },
        {
          type: 'formula',
          origin: 'ai-added',
          latex: 'n = m/M',
          useWhen: 'You have a mass and want moles.',
          where: [
            { symbol: 'n', meaning: 'amount', units: 'mol' },
            { symbol: 'm', meaning: 'mass', units: 'g' },
            { symbol: 'M', meaning: 'molar mass', units: 'g mol^-1' },
          ],
        },
      ],
    },
    {
      id: 's-2',
      title: '1.2 Isotopes',
      level: 2,
      blocks: [
        { type: 'paragraph', origin: 'ai-added', text: 'Same protons, different neutrons.' },
      ],
    },
  ],
  corrections: [],
  openQuestions: [],
  factCheck: { calculationsVerified: [], checkedClaims: 1, flags: [] },
  studyTools: { flashcards: [], quiz: [] },
  glossary: [],
};

const INPUT: BuildEnhancePromptInput = {
  context: {
    subject: 'Chemistry',
    curriculum: 'AP',
    course: 'AP Chemistry',
    unit: 'Unit 1',
    topic: '1.1',
    language: 'en',
    domainFamily: 'stem-quantitative',
  },
  options: { mode: 'complete', depth: 'match', visuals: 'auto', voice: 'keep-mine' },
  packBlock: null,
  extract: 'A mole is an amount. Atomic mass = molar mass.',
};

function run(provider: LLMProvider, extra: Partial<Parameters<typeof runEnhance>[0]> = {}) {
  return runEnhance({
    provider,
    fallback: null,
    verifier: null,
    input: INPUT,
    maxTokens: 8000,
    verifyTokens: 3000,
    temperature: 0.3,
    verifyFamilies: ['stem-quantitative'],
    signal: new AbortController().signal,
    ...extra,
  });
}

async function collect(events: AsyncGenerator<PipelineEvent>): Promise<PipelineEvent[]> {
  const out: PipelineEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

const find = <T extends PipelineEvent['type']>(events: PipelineEvent[], type: T) =>
  events.filter((event): event is Extract<PipelineEvent, { type: T }> => event.type === type);

describe('the happy path', () => {
  it('streams sections as they complete, then hands over the validated document', async () => {
    const provider = createMockProvider([{ chunks: chunked(JSON.stringify(DOC), 40) }]);
    const events = await collect(run(provider));

    expect(find(events, 'section').map((event) => event.index)).toEqual([0, 1]);
    expect(find(events, 'head')).toHaveLength(1);
    const [document] = find(events, 'document');
    expect(document?.document.title).toBe('Moles and Molar Mass');
    expect(document?.degraded).toBe(false);
    expect(find(events, 'usage')[0]?.usage.charged).toBe(true);
  });

  it('sends the deltas before the document, so the reveal is not a single jump', async () => {
    const provider = createMockProvider([{ chunks: chunked(JSON.stringify(DOC), 40) }]);
    const events = await collect(run(provider));
    const firstDelta = events.findIndex((event) => event.type === 'delta');
    const doc = events.findIndex((event) => event.type === 'document');
    expect(firstDelta).toBeGreaterThan(-1);
    expect(firstDelta).toBeLessThan(doc);
  });
});

describe('recovery', () => {
  it('falls back once on a retryable provider error, and tells the client to start over', async () => {
    const provider = createMockProvider([
      { chunks: [], error: { kind: 'rate-limit', message: '429', retryable: true } },
    ]);
    const fallback = createMockProvider([{ chunks: chunked(JSON.stringify(DOC), 64) }], {
      id: 'gemini',
      model: 'gemini-2.5-flash',
    });

    const events = await collect(run(provider, { fallback }));
    expect(find(events, 'reset')).toHaveLength(1);
    expect(find(events, 'document')).toHaveLength(1);
    expect(find(events, 'usage')[0]?.usage.fallbackUsed).toBe(true);
  });

  it('does not fall back on a bad request — retrying our own bug costs money for nothing', async () => {
    const provider = createMockProvider([
      { chunks: [], error: { kind: 'bad-request', message: '400', retryable: false } },
    ]);
    const fallback = createMockProvider([{ chunks: [JSON.stringify(DOC)] }]);
    const events = await collect(run(provider, { fallback }));

    expect(find(events, 'reset')).toHaveLength(0);
    expect(find(events, 'error')[0]?.code).toBe('provider');
    expect(find(events, 'usage')[0]?.usage.charged).toBe(false);
  });

  it('unwraps a fenced response without spending a repair call', async () => {
    const provider = createMockProvider([
      { chunks: chunked('```json\n' + JSON.stringify(DOC) + '\n```', 50) },
    ]);
    const events = await collect(run(provider));
    expect(find(events, 'document')).toHaveLength(1);
    expect(provider.calls).toHaveLength(1);
  });

  it('asks once for corrected json when the response cannot be parsed at all', async () => {
    const provider = createMockProvider([
      { chunks: ['I think the answer is 42.'] },
      { chunks: [JSON.stringify(DOC)] },
    ]);
    const events = await collect(run(provider));
    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[1]?.messages[0]?.content).toContain('Return ONLY corrected valid JSON');
    expect(find(events, 'document')).toHaveLength(1);
  });

  it('repairs a schema violation by quoting the rule that failed', async () => {
    const broken = structuredClone(DOC);
    // A formula with an unlabelled symbol is the §5 rule most worth catching.
    broken.sections[0]!.blocks[1] = {
      type: 'formula',
      origin: 'ai-added',
      latex: 'n = m/M',
      useWhen: 'You have a mass.',
      where: [{ symbol: 'n', meaning: 'amount', units: '' }],
    } as (typeof broken.sections)[0]['blocks'][number];

    const provider = createMockProvider([
      { chunks: [JSON.stringify(broken)] },
      { chunks: [JSON.stringify(DOC)] },
    ]);
    const events = await collect(run(provider));

    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[1]?.messages[0]?.content).toContain('formula');
    expect(find(events, 'document')[0]?.document.sections[0]?.blocks).toHaveLength(2);
  });

  it('degrades rather than failing when even the repair comes back broken', async () => {
    const broken = structuredClone(DOC);
    broken.sections[0]!.blocks[1] = {
      type: 'formula',
      origin: 'ai-added',
      latex: 'n = m/M',
      useWhen: '',
      where: [],
    } as (typeof broken.sections)[0]['blocks'][number];

    const provider = createMockProvider([{ chunks: [JSON.stringify(broken)] }]);
    const events = await collect(run(provider));
    const [document] = find(events, 'document');

    expect(document?.degraded).toBe(true);
    expect(document?.document.openQuestions.length).toBeGreaterThan(0);
    expect(document?.document.sections[0]?.blocks).toHaveLength(1);
  });

  it('reports a refusal without charging anything', async () => {
    const provider = createMockProvider([
      { chunks: ['{"refused":{"reason":"This is an essay to rewrite, not class notes."}}'] },
    ]);
    const events = await collect(run(provider));

    expect(find(events, 'refused')[0]?.reason).toContain('essay');
    expect(find(events, 'usage')[0]?.usage.charged).toBe(false);
    expect(find(events, 'document')).toHaveLength(0);
  });

  it('keeps what streamed and charges nothing when the student cancels', async () => {
    const controller = new AbortController();
    const provider = createMockProvider([{ chunks: chunked(JSON.stringify(DOC), 20), delayMs: 1 }]);
    const events: PipelineEvent[] = [];

    for await (const event of run(provider, { signal: controller.signal })) {
      events.push(event);
      if (event.type === 'delta' && events.length > 3) controller.abort();
    }

    expect(find(events, 'error')[0]?.code).toBe('aborted');
    expect(find(events, 'usage')[0]?.usage.charged).toBe(false);
  });
});

describe('the verify pass', () => {
  const VERIFY = {
    patches: [
      {
        sectionId: 's-1',
        kind: 'fix',
        target: 'A mole is an amount.',
        replacement: 'A mole is a count of particles: 6.022 × 10²³ of them.',
        reason: 'A mole counts particles; calling it an amount hides that it is not a mass.',
      },
      {
        sectionId: 's-2',
        kind: 'add-open-question',
        target: '',
        replacement: 'Did class cover how isotopic abundance is measured?',
        reason: 'The notes stop before the mass spectrometer.',
      },
    ],
    calculations: [{ where: 's-1 formula', ok: true, note: 'Dimensionally consistent.' }],
    flags: [],
    verdict: 'minor-fixes',
  };

  it('applies patches, logs a correction against the student text, and records the verdict', async () => {
    const provider = createMockProvider([{ chunks: [JSON.stringify(DOC)] }]);
    const verifier = createMockProvider([{ chunks: [JSON.stringify(VERIFY)] }]);
    const events = await collect(run(provider, { verifier }));
    const document = find(events, 'document')[0]?.document;

    expect(document?.sections[0]?.blocks[0]).toMatchObject({
      origin: 'ai-corrected',
      text: 'A mole is a count of particles: 6.022 × 10²³ of them.',
    });
    expect(document?.corrections).toHaveLength(1);
    expect(document?.openQuestions).toHaveLength(1);
    expect(document?.factCheck.verdict).toBe('minor-fixes');
    expect(document?.factCheck.calculationsVerified).toHaveLength(1);
  });

  it('does not run for a family the config does not verify', async () => {
    const provider = createMockProvider([{ chunks: [JSON.stringify(DOC)] }]);
    const verifier = createMockProvider([{ chunks: [JSON.stringify(VERIFY)] }]);
    await collect(run(provider, { verifier, verifyFamilies: ['stem-descriptive'] }));
    expect(verifier.calls).toHaveLength(0);
  });

  it('flags rather than guesses when the examiner quotes text that is not there', async () => {
    const provider = createMockProvider([{ chunks: [JSON.stringify(DOC)] }]);
    const verifier = createMockProvider([
      {
        chunks: [
          JSON.stringify({
            patches: [
              {
                sectionId: 's-1',
                kind: 'fix',
                target: 'a sentence the draft never contained',
                replacement: 'something else',
                reason: 'Wrong.',
              },
            ],
            calculations: [],
            flags: [],
            verdict: 'minor-fixes',
          }),
        ],
      },
    ]);

    const events = await collect(run(provider, { verifier }));
    const document = find(events, 'document')[0]?.document;
    expect(document?.sections[0]?.blocks[0]).toMatchObject({ origin: 'student' });
    expect(document?.factCheck.flags).toHaveLength(1);
  });
});
