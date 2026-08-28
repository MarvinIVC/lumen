/**
 * App-wide constants. The product name is still an open decision (00-BRIEF.md §9), so it lives
 * behind a single constant — renaming is a one-line change plus the env var.
 */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Lumen';

export const APP_TAGLINE =
  'Turn the messy notes you already have into a complete, correct, and beautiful study guide.';

export const APP_DESCRIPTION =
  'Upload the class notes you already have — .docx, .pdf, photos, or pasted text — and get them ' +
  'back complete, fact-checked, and typeset. Free.';

/** Shown wherever AI output is displayed (00-BRIEF.md §5.4). */
export const AI_DISCLAIMER = 'AI-generated study aid — verify against your textbook and teacher.';

/** Nominative-use disclaimer for curriculum trademarks (00-BRIEF.md §8, 06 §7). */
export const CURRICULUM_DISCLAIMER =
  'AP® and IB® are trademarks of the College Board and the International Baccalaureate ' +
  'Organization, which do not endorse and are not affiliated with this project.';
