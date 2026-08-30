/**
 * "This doesn't look like class notes" (01-PRODUCT.md §5, review row 1).
 *
 * A soft, client-side warning — never a refusal. The real gate is the content check in the enhance
 * prompt (02-ARCHITECTURE.md §7 layer 3), which runs on the server and can say no. This one exists
 * to catch the honest mistake early: someone drops their history essay in expecting it to be
 * proofread, and finds out now rather than after spending a daily credit.
 *
 * It errs towards silence. Real notes are messy in ways that resemble every signal here — a
 * student who writes in full paragraphs is not doing anything wrong — so a warning needs more than
 * one signal to fire, and it always says "carry on if you meant to".
 */
import type { ExtractedBlock } from './types';

export type QualitySignal = 'essay-prose' | 'code' | 'very-short' | 'no-structure';

export interface QualityReport {
  signals: QualitySignal[];
  /** True when the review screen should show the soft warning. */
  warn: boolean;
  message: string | null;
}

/** Longer than any note-taking student writes without a break. */
const LONG_PARAGRAPH = 600;
const CODE_MARKERS =
  /\b(function|const|import|class|def|public static|SELECT .* FROM|<\/?[a-z]+>|=>|\{\s*$)/;

export function assessQuality(blocks: ExtractedBlock[]): QualityReport {
  const text = blocks.filter((block) => block.kind !== 'image');
  const totalChars = text.reduce((total, block) => total + block.text.length, 0);
  const signals: QualitySignal[] = [];

  if (totalChars === 0) {
    return { signals: [], warn: false, message: null };
  }

  const paragraphs = text.filter((block) => block.kind === 'paragraph');
  const longProse = paragraphs.filter((block) => block.text.length > LONG_PARAGRAPH);
  const proseShare =
    longProse.reduce((total, block) => total + block.text.length, 0) / Math.max(1, totalChars);
  if (proseShare > 0.6 && longProse.length >= 2) signals.push('essay-prose');

  const codeLines = text.filter((block) => CODE_MARKERS.test(block.text));
  if (codeLines.length / text.length > 0.4) signals.push('code');

  const structured = text.filter(
    (block) => block.kind === 'heading' || block.kind === 'list' || block.kind === 'table',
  );
  if (structured.length === 0 && text.length > 6) signals.push('no-structure');

  if (totalChars < 200) signals.push('very-short');

  /*
   * Only the two signals that mean "this is not class notes" raise the warning.
   *
   * `no-structure` on its own is a style — plenty of students write in unbroken prose — and
   * `very-short` is a fact about length, not about kind. Requiring two signals sounded cautious
   * and was simply wrong: a three-paragraph history essay, the exact case this exists to catch,
   * produces one.
   */
  const warn = signals.includes('essay-prose') || signals.includes('code');

  return {
    signals,
    warn,
    message: warn ? messageFor(signals) : null,
  };
}

function messageFor(signals: QualitySignal[]): string {
  if (signals.includes('code')) {
    return (
      'This reads more like source code than class notes. We can still work on it, but the ' +
      'study guide will be better if you give us the lesson it belongs to.'
    );
  }
  return (
    'This reads more like an essay than class notes — long paragraphs, no headings or lists. ' +
    'We can still work on it, but this is built for notes, and it will do a better job on them. ' +
    'Carry on if you meant to.'
  );
}
