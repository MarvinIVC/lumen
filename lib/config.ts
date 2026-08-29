import { clientEnv } from './env';

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

/**
 * Nominative-use disclaimer for curriculum trademarks (00-BRIEF.md §8, 06 §7).
 *
 * `06` §7 names four rights-holders, not two — the phase-00 version listed only AP and IB, which
 * was already inaccurate the moment the IGCSE and A-Level packs were planned.
 *
 * The marketing footer renders the translated copy from `messages/*.json` rather than this
 * constant, because the footer has to speak the reader's language. `tests/unit/messages.test.ts`
 * asserts the English message and this constant say the same thing, so they cannot drift.
 */
export const CURRICULUM_DISCLAIMER =
  'AP®, IB®, Cambridge/CIE® and Edexcel® are trademarks of the College Board, the International ' +
  'Baccalaureate Organization, Cambridge University Press & Assessment, and Pearson ' +
  'respectively. None of them endorse, sponsor, or are affiliated with this project. Curriculum ' +
  'packs are aligned to the publicly published syllabus.';

/** Where the source lives. The footer, the about page and every "report a bug" route point here. */
export const GITHUB_URL = 'https://github.com/MarvinIVC/lumen';

/**
 * The date shown on /privacy and /terms. A hardcoded constant rather than a build timestamp: the
 * date must mean "when the policy last changed", and a build date would silently claim a fresh
 * review every deploy.
 */
export const LEGAL_UPDATED = '2026-08-29';

/**
 * The phase-01 design harness at /dev: on for `next dev`, and in any other build only when
 * NEXT_PUBLIC_DEV_SCREENS is set — which is what lets the end-to-end suite exercise the note
 * renderer against `next start` without the screens reaching the live site.
 *
 * `=== 'development'`, not `!== 'production'`. Both behave identically today — NODE_ENV really is
 * `'production'` in the build's render workers, so nothing was leaking. But a gate that decides
 * what ships should name the one case it opens rather than every case it fails to close:
 * `!== 'production'` also says yes to `'test'` and to an unset value, neither of which anyone
 * chose. Same behaviour now, narrower blast radius later.
 */
export function devScreensEnabled(): boolean {
  return process.env.NODE_ENV === 'development' || clientEnv.NEXT_PUBLIC_DEV_SCREENS;
}
