/**
 * Which language the notes are in (04-AI-ENGINE.md §3).
 *
 * `04` §3 names franc or tinyld. Neither is here, and that is a deliberate trade recorded in the
 * phase-03 log: the smallest of them is ~200 KB for a field the student sees, can override with
 * one control, and which only has to be right about the two languages this product actually
 * renders. Script ranges settle CJK, Cyrillic, Arabic, Devanagari, Hangul, Greek, Hebrew and Thai
 * outright; a stopword vote settles the Latin-script languages a student is plausibly taking
 * notes in. Everything else returns low confidence, which the review screen shows as a question
 * rather than an answer.
 *
 * The output is BCP-47 because that is what `NoteContext.language` is and what the model is told
 * to produce (04 §4.5).
 */

export interface LanguageGuess {
  /** BCP-47. `und` when nothing scored — the review screen asks. */
  language: string;
  confidence: number;
}

/** Ranges that identify a language (or a small family) on sight. */
const SCRIPTS: { language: string; pattern: RegExp; confidence: number }[] = [
  { language: 'ja', pattern: /[぀-ゟ゠-ヿ]/u, confidence: 0.95 },
  { language: 'ko', pattern: /[가-힯ᄀ-ᇿ]/u, confidence: 0.95 },
  { language: 'zh', pattern: /[一-鿿㐀-䶿]/u, confidence: 0.9 },
  { language: 'ru', pattern: /[Ѐ-ӿ]/u, confidence: 0.85 },
  { language: 'ar', pattern: /[؀-ۿ]/u, confidence: 0.9 },
  { language: 'he', pattern: /[֐-׿]/u, confidence: 0.9 },
  { language: 'hi', pattern: /[ऀ-ॿ]/u, confidence: 0.9 },
  { language: 'th', pattern: /[฀-๿]/u, confidence: 0.9 },
  { language: 'el', pattern: /[Ͱ-Ͽ]/u, confidence: 0.8 },
];

/**
 * Function words. Chosen to be frequent and, as far as possible, not shared with a neighbour —
 * `de` is Spanish, Portuguese and French all at once, so it is in none of them.
 */
const STOPWORDS: Record<string, string[]> = {
  en: ['the', 'and', 'of', 'to', 'is', 'that', 'with', 'this', 'are', 'be', 'which', 'from'],
  es: ['que', 'los', 'las', 'una', 'con', 'por', 'para', 'como', 'pero', 'está', 'sus'],
  fr: ['les', 'des', 'une', 'est', 'que', 'pour', 'dans', 'sur', 'avec', 'sont', 'cette'],
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'ein', 'eine', 'mit', 'werden', 'sich'],
  pt: ['que', 'não', 'uma', 'com', 'para', 'como', 'são', 'mais', 'pelo', 'está'],
  it: ['che', 'non', 'una', 'per', 'con', 'sono', 'nel', 'alla', 'come', 'anche'],
  nl: ['het', 'een', 'van', 'niet', 'zijn', 'dat', 'voor', 'met', 'aan', 'worden'],
  id: ['yang', 'dan', 'dengan', 'untuk', 'pada', 'adalah', 'tidak', 'dari', 'ini'],
  vi: ['của', 'và', 'các', 'được', 'trong', 'là', 'người', 'những', 'không'],
};

/**
 * Enough Latin text to run a stopword vote on. It does not gate the script check, and that
 * distinction matters: 60 characters of English is a sentence fragment, while 60 characters of
 * Chinese is two full sentences — applying one floor to both made a page of Chinese notes come
 * back as "unknown" while the script was sitting there in plain sight.
 */
const MIN_LATIN_SAMPLE = 60;

/** A script is only identifiable at all once there are a few characters of it. */
const MIN_SCRIPT_SAMPLE = 12;

export function detectLanguage(text: string): LanguageGuess {
  const sample = text.slice(0, 4000);
  const trimmed = sample.trim();
  if (trimmed.length < MIN_SCRIPT_SAMPLE) return { language: 'und', confidence: 0 };

  for (const script of SCRIPTS) {
    // A stray CJK glyph in an English note should not flip the language, so require a share of it.
    const hits = countMatches(sample, script.pattern);
    if (hits / sample.length > 0.05) {
      return { language: script.language, confidence: script.confidence };
    }
  }

  if (trimmed.length < MIN_LATIN_SAMPLE) return { language: 'und', confidence: 0 };

  const words = sample.toLowerCase().match(/[\p{L}'’]+/gu) ?? [];
  if (words.length < 12) return { language: 'und', confidence: 0.2 };

  const counts = new Map<string, number>();
  for (const word of words) {
    for (const [language, list] of Object.entries(STOPWORDS)) {
      if (list.includes(word)) counts.set(language, (counts.get(language) ?? 0) + 1);
    }
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const [best, runnerUp] = ranked;
  if (!best || best[1] < 3) {
    // Latin script with no function words at all: equations, bullet fragments, a term list.
    // English is the honest default for this product's audience, but not a confident one.
    return { language: 'en', confidence: 0.35 };
  }

  const share = best[1] / words.length;
  const margin = (best[1] - (runnerUp?.[1] ?? 0)) / best[1];
  return {
    language: best[0],
    confidence: Math.min(0.95, 0.45 + share * 2 + margin * 0.3),
  };
}

function countMatches(text: string, pattern: RegExp): number {
  const global = new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`);
  return (text.match(global) ?? []).length;
}
