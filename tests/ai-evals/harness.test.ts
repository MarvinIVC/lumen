import { describe, expect, it } from 'vitest';

import { chunked, createMockProvider } from './mock-provider';

/**
 * The eval suite proper — hard checks and the LLM-judge rubric against `fixtures/` — lands with
 * the pipeline in phase-04 (04-AI-ENGINE.md §9). What phase-00 owns is the harness itself: the
 * job runs, the mock provider streams, and a red eval can fail the build.
 */
describe('mock provider', () => {
  it('streams text, then usage, then done', async () => {
    const provider = createMockProvider([{ chunks: chunked('{"title":"Moles"}', 4) }]);
    const kinds: string[] = [];
    let text = '';

    for await (const chunk of provider.chat({
      system: 'test',
      messages: [{ role: 'user', content: 'notes' }],
      json: true,
      maxTokens: 100,
      temperature: 0.3,
      signal: new AbortController().signal,
    })) {
      kinds.push(chunk.type);
      if (chunk.type === 'text') text += chunk.text;
    }

    expect(text).toBe('{"title":"Moles"}');
    expect(kinds.at(-2)).toBe('usage');
    expect(kinds.at(-1)).toBe('done');
    expect(provider.calls).toHaveLength(1);
  });

  it('replays a failure then a success, which is the fallback path', async () => {
    const provider = createMockProvider([
      { chunks: [], error: { kind: 'rate-limit', message: '429', retryable: true } },
      { chunks: ['{}'] },
    ]);

    const drain = async () => {
      const out: string[] = [];
      for await (const chunk of provider.chat({
        system: '',
        messages: [],
        json: true,
        maxTokens: 10,
        temperature: 0,
        signal: new AbortController().signal,
      })) {
        out.push(chunk.type);
      }
      return out;
    };

    expect(await drain()).toContain('error');
    expect(await drain()).toContain('text');
  });

  it('stops streaming when the caller aborts, so a cancel charges no credit', async () => {
    const controller = new AbortController();
    const provider = createMockProvider([{ chunks: ['a', 'b', 'c'], delayMs: 1 }]);
    const seen: string[] = [];

    for await (const chunk of provider.chat({
      system: '',
      messages: [],
      json: true,
      maxTokens: 10,
      temperature: 0,
      signal: controller.signal,
    })) {
      if (chunk.type === 'text') seen.push(chunk.text);
      controller.abort();
    }

    expect(seen).toEqual(['a']);
  });
});
