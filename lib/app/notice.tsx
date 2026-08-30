'use client';

import type { ReactNode } from 'react';

import { AlertTriangleIcon } from '@/components/ui/icons';

/**
 * The one-line inline notice `/app` uses for a caveat that is not an error.
 *
 * Lived inside the review screen until the note screen needed the same thing — a partial study
 * guide, a document that came back degraded, a second check that revised several points. Three
 * tones and no dismiss button: these say something true about what is on the screen, so they go
 * away when that stops being true and not before.
 */
export function Notice({
  tone,
  children,
}: {
  tone: 'warning' | 'info' | 'accent';
  children: ReactNode;
}) {
  const shell =
    tone === 'warning'
      ? 'border-warning/50 bg-verify'
      : tone === 'accent'
        ? 'border-accent/40 bg-accent-subtle'
        : 'border-border bg-bg-sunken';

  return (
    <div className={`flex items-start gap-2.5 rounded-md border px-3 py-2.5 ${shell}`}>
      {tone === 'warning' ? (
        <AlertTriangleIcon aria-hidden="true" className="mt-0.5 shrink-0 text-base text-warning" />
      ) : null}
      <p className="font-sans text-sm leading-snug text-text">{children}</p>
    </div>
  );
}
