import { describe, expect, it } from 'vitest';

import en from '@/messages/en.json';
import zh from '@/messages/zh.json';
import { LOCALES } from '@/i18n/config';
import { CURRICULUM_DISCLAIMER } from '@/lib/config';

/**
 * The message catalogues must stay in lockstep.
 *
 * A missing key does not throw at build time — next-intl renders the key path as the visible string
 * — so an untranslated addition ships as `howItWorks.faq.3.q` in the middle of a Chinese page and
 * nobody notices until a reader does. Structural parity is the cheapest possible guard against that,
 * and it is what makes "every visible string comes from a catalogue" a rule rather than an aspiration.
 */

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

const CATALOGUES: Record<string, Json> = { en, zh };

/** Every leaf path in a catalogue, e.g. `hero.headline` or `problem.items.0.quote`. */
function paths(value: Json, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => paths(entry, `${prefix}.${index}`));
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) =>
      paths(entry, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

/** ICU placeholders like `{app}`, which have to survive translation or the sentence loses a word. */
function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '').sort();
}

function leaves(value: Json): Map<string, string> {
  const found = new Map<string, string>();

  const walk = (node: Json, prefix: string) => {
    if (Array.isArray(node)) {
      node.forEach((entry, index) => walk(entry, `${prefix}.${index}`));
    } else if (node !== null && typeof node === 'object') {
      for (const [key, entry] of Object.entries(node)) {
        walk(entry, prefix ? `${prefix}.${key}` : key);
      }
    } else if (typeof node === 'string') {
      found.set(prefix, node);
    }
  };

  walk(value, '');
  return found;
}

describe('message catalogues', () => {
  it('covers every configured locale', () => {
    // A locale in `i18n/config.ts` with no catalogue would 500 the route rather than fall back.
    expect(Object.keys(CATALOGUES).sort()).toEqual([...LOCALES].sort());
  });

  it('has the same keys in every locale', () => {
    const reference = paths(en);

    for (const [locale, catalogue] of Object.entries(CATALOGUES)) {
      const actual = paths(catalogue);

      expect(
        actual.filter((key) => !reference.includes(key)),
        `messages/${locale}.json has keys English does not`,
      ).toEqual([]);

      expect(
        reference.filter((key) => !actual.includes(key)),
        `messages/${locale}.json is missing keys — an untranslated string renders as its key path`,
      ).toEqual([]);
    }
  });

  it('keeps the same ICU placeholders in every locale', () => {
    const reference = leaves(en);

    for (const [locale, catalogue] of Object.entries(CATALOGUES)) {
      if (locale === 'en') continue;

      const offenders: string[] = [];
      for (const [key, value] of leaves(catalogue)) {
        const expected = placeholders(reference.get(key) ?? '');
        const actual = placeholders(value);
        if (expected.join() !== actual.join()) {
          offenders.push(
            `${key}: expected {${expected.join('}, {')}} — got {${actual.join('}, {')}}`,
          );
        }
      }

      expect(offenders, `messages/${locale}.json changed a placeholder`).toEqual([]);
    }
  });

  it('has no empty strings', () => {
    for (const [locale, catalogue] of Object.entries(CATALOGUES)) {
      const empty = [...leaves(catalogue)].filter(([, value]) => value.trim() === '');
      expect(empty.map(([key]) => `${locale}:${key}`)).toEqual([]);
    }
  });

  it('keeps the footer disclaimer and CURRICULUM_DISCLAIMER saying the same thing', () => {
    // The footer renders the translated message so a Chinese page is not interrupted by a
    // paragraph of English; the app renders the constant. They are a legal statement, so the two
    // must not be allowed to drift into disclaiming different things.
    expect(en.footer.disclaimer).toBe(CURRICULUM_DISCLAIMER);
  });
});
