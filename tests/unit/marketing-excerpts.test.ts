import { describe, expect, it } from 'vitest';

import en from '@/messages/en.json';
import zh from '@/messages/zh.json';
import { CUT_OFF_LINE, HERO_RAW_EXCERPT } from '@/lib/marketing/excerpts';
import { GOLD_FIXTURE_MARKDOWN } from '@/lib/render/fixture/gold-source';
import { RAW_FIXTURE_MARKDOWN } from '@/lib/render/fixture/raw-source';

/**
 * The landing page's central claim is that the notes on it are real (03-DESIGN.md §8.1–8.2:
 * "three real snippets from the fixture"). That claim is only true for as long as every quoted line
 * is still a verbatim substring of the fixture it is quoted from.
 *
 * It is exactly the kind of claim that decays quietly: someone tidies an apostrophe in a caption,
 * or "improves" a clumsy sentence in the marketing copy, and the page is now showing invented
 * student notes while still saying "nothing is invented". This is the check that makes the promise
 * enforceable rather than aspirational.
 */

const QUOTE_SOURCES = { en, zh };

describe('the quoted notes are the real notes', () => {
  it('slices the hero excerpt straight out of the raw fixture', () => {
    expect(RAW_FIXTURE_MARKDOWN).toContain(HERO_RAW_EXCERPT);
    // Guards against a slice that silently collapsed to a couple of characters.
    expect(HERO_RAW_EXCERPT.length).toBeGreaterThan(400);
    expect(HERO_RAW_EXCERPT).toContain('Atomic mass = molar mass');
  });

  it('quotes the line the notes actually stop on', () => {
    expect(RAW_FIXTURE_MARKDOWN).toContain(CUT_OFF_LINE);
    // It is the *last* line, which is the whole point of the caption under it.
    expect(RAW_FIXTURE_MARKDOWN.trimEnd().endsWith(CUT_OFF_LINE)).toBe(true);
  });

  it.each(Object.entries(QUOTE_SOURCES))(
    'quotes the raw fixture verbatim in every "the problem" card (%s)',
    (locale, catalogue) => {
      const items = catalogue.problem.items;
      expect(items.length).toBe(3);

      for (const item of items) {
        for (const line of item.quote.split('\n')) {
          expect(
            RAW_FIXTURE_MARKDOWN,
            `messages/${locale}.json quotes a line that is not in fixtures/ap-chem-u1-raw.md: ` +
              `"${line}". The quotes are the student's own words and must not be edited.`,
          ).toContain(line);
        }
      }
    },
  );

  it('keeps the quotes identical in every locale', () => {
    // The captions translate; the student's notes do not. They are an English AP Chemistry file,
    // and translating them would make the page's "this is a real file" claim false.
    expect(zh.problem.items.map((item) => item.quote)).toEqual(
      en.problem.items.map((item) => item.quote),
    );
  });
});

describe("the hero's finished panel matches the gold fixture", () => {
  /**
   * `gold-page.tsx` is hand-set rather than parsed (see the note at the top of that file), which
   * buys the hero a cropped, composed excerpt at the cost of this check: the sentences it sets have
   * to still exist in the fixture they claim to come from.
   */
  const PHRASES = [
    'AP Chemistry · Unit 1 (Topics 1.1–1.4)',
    '1.1 — The mole and molar mass',
    'Two masses, one number.',
    'Avogadro constant',
    'Atomic mass',
    'Molar mass',
  ];

  it.each(PHRASES)('still contains "%s"', (phrase) => {
    expect(GOLD_FIXTURE_MARKDOWN).toContain(phrase);
  });

  it("uses the fixture's own title as the panel caption", () => {
    expect(GOLD_FIXTURE_MARKDOWN).toContain(en.hero.afterCaption);
    // The note itself is not translated, so both locales caption it the same way.
    expect(zh.hero.afterCaption).toBe(en.hero.afterCaption);
  });
});
