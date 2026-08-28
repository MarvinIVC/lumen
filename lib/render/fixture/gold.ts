import type { NoteDocument } from '@/lib/ai/schema';

import { GOLD_FIXTURE_MARKDOWN } from './gold-source';
import { parseGoldFixture } from './parse-gold';

let cached: NoteDocument | null = null;

/**
 * The gold fixture as a `NoteDocument`. Dev and test only — parsed once and memoised, because
 * every story on the page would otherwise re-run the parser.
 */
export function goldFixture(): NoteDocument {
  cached ??= parseGoldFixture(GOLD_FIXTURE_MARKDOWN);
  return cached;
}
