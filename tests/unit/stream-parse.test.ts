import { describe, expect, it } from 'vitest';

import { TolerantJsonStream, largestValidJson, parsePartialJson } from '@/lib/ai/stream-parse';

/**
 * The streaming parser is the only thing between a token stream and a note appearing section by
 * section, and every failure mode it has is a rendering bug that only shows up on a slow network.
 * So it is tested at three chunk sizes: one byte (the pathological case), seven (a size that lands
 * mid-escape and mid-key), and sixty-four (roughly what an SSE frame carries).
 */
const DOC = {
  title: 'Atomic Structure',
  summary: 'A lesson about the mole, isotopes and formulas — with a "quote" and a \\backslash.',
  objectives: ['Convert mass to moles', 'Read a mass spectrum'],
  sections: [
    {
      id: 's-1',
      title: '1.1 Moles',
      level: 2,
      blocks: [{ type: 'paragraph', origin: 'student', text: 'A mole is a count.' }],
    },
    {
      id: 's-2',
      title: '1.2 Isotopes',
      level: 2,
      blocks: [
        { type: 'list', origin: 'ai-added', ordered: false, items: ['same Z', 'different N'] },
      ],
    },
    {
      id: 's-3',
      title: '1.3 Formulas',
      level: 2,
      blocks: [{ type: 'paragraph', origin: 'ai-added', text: 'Empirical vs molecular.' }],
    },
  ],
  corrections: [],
  openQuestions: [],
  factCheck: { calculationsVerified: [], checkedClaims: 3, flags: [] },
  studyTools: { flashcards: [], quiz: [] },
  glossary: [],
};

const JSON_TEXT = JSON.stringify(DOC);

function feed(size: number) {
  const stream = new TolerantJsonStream();
  const sections: { index: number; section: unknown }[] = [];
  let head: unknown = null;
  const keys: (string | null)[] = [];

  for (let i = 0; i < JSON_TEXT.length; i += size) {
    const update = stream.push(JSON_TEXT.slice(i, i + size));
    sections.push(...update.sections);
    if (update.head) head = update.head;
    keys.push(update.currentKey);
  }
  const end = stream.finish();
  sections.push(...end.sections);
  return { stream, sections, head, keys, end };
}

describe.each([1, 7, 64, 4096])('at %i-byte chunks', (size) => {
  it('emits every section exactly once, in order', () => {
    const { sections } = feed(size);
    expect(sections.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(sections.map((s) => (s.section as { id: string }).id)).toEqual(['s-1', 's-2', 's-3']);
  });

  it('never emits a half-written section', () => {
    const { sections } = feed(size);
    for (const { section } of sections) {
      const parsed = section as { id: string; title: string; blocks: unknown[] };
      expect(parsed.blocks.length).toBeGreaterThan(0);
      expect(parsed.title).toBeTruthy();
    }
  });

  it('hands over the head once, with the strings intact', () => {
    const { head } = feed(size);
    expect(head).toMatchObject({ title: 'Atomic Structure', objectives: DOC.objectives });
    expect((head as { summary: string }).summary).toBe(DOC.summary);
  });

  it('parses the whole document at the end', () => {
    const { end } = feed(size);
    expect(end.ok).toBe(true);
    expect(end.value).toEqual(DOC);
  });
});

describe('while streaming', () => {
  it('names the key currently being written, for the narration line', () => {
    const stream = new TolerantJsonStream();
    stream.push('{"title":"Moles","summary":"…","objectives":["a"],"sections":[');
    expect(stream.key).toBe('sections');
    stream.push('{"id":"s-1","title":"T","level":2,"blocks":[]}],"studyTools":{"flashcards":[');
    expect(stream.key).toBe('studyTools');
  });

  it('holds back the section still being written', () => {
    const stream = new TolerantJsonStream();
    const first = stream.push(
      '{"title":"T","summary":"s","objectives":[],"sections":[{"id":"s-1","title":"One","level":2,"blocks":[]}',
    );
    expect(first.sections).toEqual([]);
    const second = stream.push(',{"id":"s-2"');
    expect(second.sections.map((s) => s.index)).toEqual([0]);
  });

  it('survives a chunk boundary inside an escape sequence', () => {
    const stream = new TolerantJsonStream();
    stream.push('{"title":"a \\');
    stream.push('"quoted\\" title","summary":"s","objectives":[],"sections":[]}');
    const end = stream.finish();
    expect(end.ok).toBe(true);
    expect((end.value as { title: string }).title).toBe('a "quoted" title');
  });
});

describe('largestValidJson', () => {
  it('unwraps a markdown fence', () => {
    expect(largestValidJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('ignores an apology after the object', () => {
    expect(largestValidJson('{"a":1}\n\nI hope that helps!')).toEqual({ a: 1 });
  });

  it('ignores a preamble before the object', () => {
    expect(largestValidJson('Here is your study guide:\n{"a":[1,2]}')).toEqual({ a: [1, 2] });
  });

  it('returns undefined when there is no object at all', () => {
    expect(largestValidJson('I cannot help with that.')).toBeUndefined();
  });
});

describe('parsePartialJson', () => {
  it('recovers the complete prefix of a truncated document', () => {
    const truncated = JSON_TEXT.slice(0, JSON_TEXT.indexOf('"s-3"'));
    const value = parsePartialJson(truncated) as { sections: unknown[]; title: string };
    expect(value.title).toBe('Atomic Structure');
    expect(value.sections.length).toBeGreaterThanOrEqual(2);
  });
});
