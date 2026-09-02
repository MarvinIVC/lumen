'use client';

/**
 * Handing a finished file to the browser.
 *
 * One module, because the object URL has to be revoked and the place it is easiest to forget is
 * the fourth copy of these six lines.
 */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoking synchronously cancels the download in Safari; a turn of the event loop is enough.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** A filename that survives every filesystem, from a title a student typed. */
export function safeFilename(title: string, fallback = 'lumen-note'): string {
  const cleaned = title
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 60);
  return cleaned || fallback;
}
