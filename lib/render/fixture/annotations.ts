import type { Origin } from '@/lib/ai/schema';

/**
 * The gold fixture marks provenance in prose — `[student: kept, sharpened]`, `*(ai-added)*`,
 * `[ai-corrected — see Correction 1]` — because it was written for a human to read. The real
 * pipeline emits `origin` as a field. This module is the bridge, and it exists only for the
 * fixture: nothing in the shipped pipeline parses annotations out of text.
 */

const BRACKET = /\[(?:student|ai-added|ai-clarified|ai-corrected)[^\]]*\]/gi;
const PARENS = /\*\((?:student|ai-added|ai-clarified|ai-corrected)[^)]*\)\*/gi;

/** Most specific first: a passage marked both corrected and added is, above all, corrected. */
const PRECEDENCE: Origin[] = ['ai-corrected', 'ai-added', 'ai-clarified', 'student'];

export interface Annotated {
  /** The text with the annotations removed and whitespace tidied. */
  text: string;
  origin: Origin;
  /** True when an annotation was actually present, as opposed to defaulting to `student`. */
  explicit: boolean;
}

export function readAnnotations(input: string): Annotated {
  const found = [...(input.match(BRACKET) ?? []), ...(input.match(PARENS) ?? [])]
    .join(' ')
    .toLowerCase();

  const origin = PRECEDENCE.find((candidate) => found.includes(candidate)) ?? 'student';

  const text = input
    .replace(BRACKET, '')
    .replace(PARENS, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  return { text, origin, explicit: found.length > 0 };
}

/** Drops annotations without caring what they said — for headings and captions. */
export function stripAnnotations(input: string): string {
  return readAnnotations(input).text;
}
