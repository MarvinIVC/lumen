/**
 * Input caps (02-ARCHITECTURE.md §7 layer 3) and the copy that explains them (01-PRODUCT.md §5).
 *
 * These are enforced in the browser, before anything is parsed and long before anything is sent.
 * They are not a security boundary — the edge function re-checks in phase-04 — they exist so a
 * student who drops a 300-page textbook finds out in a second rather than after a minute of
 * parsing, and so the model is never handed more than a lesson.
 *
 * The soft page limit is the interesting one. Forty pages is not a technical threshold; it is the
 * point past which the input has almost certainly stopped being one lesson, and the right response
 * is to explain the per-lesson model rather than to refuse.
 */

export const MAX_BYTES = 25 * 1024 * 1024;
export const MAX_PAGES = 60;
/** Above this we explain and offer to split; below it we say nothing. */
export const SOFT_PAGE_LIMIT = 40;
export const MAX_CHARS = 60_000;

/** Longest edge, in pixels, after downscaling a photo or a scanned page. */
export const MAX_IMAGE_EDGE = 2000;

/** Below this a source is "nearly empty" and probably a scan (01-PRODUCT.md §5). */
export const MIN_USEFUL_CHARS = 40;

/** A PDF page with less than this much text has no usable text layer. */
export const MIN_PAGE_TEXT_CHARS = 24;

export const DOCUMENT_EXTENSIONS = ['.docx', '.pdf', '.md', '.txt', '.rtf'] as const;
export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.heic', '.heif', '.webp'] as const;

export const ACCEPTED_EXTENSIONS = [...DOCUMENT_EXTENSIONS, ...IMAGE_EXTENSIONS];

/** The `accept` attribute. Includes MIME types because some Android pickers ignore extensions. */
export const ACCEPT_ATTRIBUTE = [
  ...ACCEPTED_EXTENSIONS,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/rtf',
  'image/*',
].join(',');

/** "Word, PDF, Markdown, text, RTF, or a photo" — for the rejection message. */
export const ACCEPTED_SUMMARY = 'Word (.docx), PDF, Markdown, plain text, RTF, or a photo';

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

export function isAccepted(name: string): boolean {
  return (ACCEPTED_EXTENSIONS as readonly string[]).includes(extensionOf(name));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/* -------------------------------------------------------------------------- *
 * The copy. One place, so the same limit never gets explained two ways.
 * -------------------------------------------------------------------------- */

export const CAP_MESSAGES = {
  unsupported: (name: string) =>
    `We can't read ${extensionOf(name) || 'that kind of file'}. Try ${ACCEPTED_SUMMARY} — ` +
    `or paste the text in below.`,
  tooLarge: (name: string, size: number) =>
    `${name} is ${formatBytes(size)}. The limit is ${formatBytes(MAX_BYTES)} per lesson. ` +
    `If it's a whole term of notes, split it and do one lesson at a time — you'll get a better ` +
    `study guide out of each.`,
  tooManyPages: (pages: number) =>
    `That's ${pages} pages. We work a lesson at a time and cap it at ${MAX_PAGES}. ` +
    `Split it into units and run them separately.`,
  manyPages: (pages: number) =>
    `${pages} pages is more than one lesson usually is. You'll get a sharper study guide if you ` +
    `split it — but carry on if this really is one lesson.`,
  tooMuchText: (chars: number) =>
    `That's about ${Math.round(chars / 1000)}k characters, and we cap a lesson at ` +
    `${MAX_CHARS / 1000}k. Trim it or split it — the extra is cut from the end otherwise.`,
  encrypted: (name: string) =>
    `${name} is password-protected. Type the password and we'll unlock it here in your browser — ` +
    `it is never sent anywhere.`,
  wrongPassword: 'That password did not open it. Try again, or paste the text instead.',
  empty: (name: string) =>
    `We couldn't find any text in ${name}. If it's a scan or a photo, run OCR on it below. ` +
    `Otherwise, paste the text in.`,
  corrupt: (name: string) =>
    `We couldn't open ${name} — it may be damaged, or saved in an older format. ` +
    `Re-save it as .docx or paste the text instead.`,
} as const;
