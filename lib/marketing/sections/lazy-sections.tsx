'use client';

import { Suspense, lazy, useRef, type ReactNode } from 'react';

import { useScrollableRegion } from '@/lib/render/use-overflow';

import { useInView } from '../use-in-view';

/*
 * Every expensive module on the landing page is reachable through exactly these two imports and no
 * others. That is what keeps the renderer, the fixture parser, the 14 KB of fixture markdown,
 * KaTeX, Mermaid and smiles-drawer out of the first load (02-ARCHITECTURE.md §8) — a single static
 * import of either target anywhere else would undo it, and `scripts/check-route-budget.mjs` is what
 * notices when someone does.
 */
const DemoNote = lazy(() => import('./demo-note'));
const TrustNote = lazy(() => import('./trust-note'));

/**
 * The full gold fixture, live, once the section is nearly on screen (03-DESIGN.md §8.4).
 *
 * `children` is the server-rendered opening of the note — a real title, a real summary, real
 * objectives, the real outline. That is what crawlers index, what a reader with JavaScript off gets
 * to read, and what fills the space until the live document lands. It is deliberately not a
 * skeleton: placeholder rectangles would make the page's most substantial content invisible to
 * everything that does not run scripts.
 */
export function DemoEmbed({
  children,
  loadingLabel,
  frameLabel,
}: {
  children: ReactNode;
  loadingLabel: string;
  frameLabel: string;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const frame = useRef<HTMLDivElement>(null);

  /*
   * The renderer's own hook, not a hardcoded `tabIndex`: a scroll container a keyboard cannot
   * reach fails WCAG 2.1.1, but a focus stop on a frame that is not currently scrollable is just
   * a dead tab press. It measures — and it re-measures when the note arrives, which matters here
   * more than anywhere else, because before the dynamic import lands this frame holds a short
   * static summary that does not overflow at all.
   */
  useScrollableRegion(frame, frameLabel);

  return (
    <div ref={frame} className="max-h-[min(80vh,52rem)] overflow-y-auto overscroll-contain">
      <div ref={ref}>
        {inView ? (
          <Suspense fallback={<Loading label={loadingLabel}>{children}</Loading>}>
            <DemoNote />
          </Suspense>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

/** The provenance mark and the corrections panel, live, for step two of "how it works". */
export function TrustPreview({
  children,
  loadingLabel,
  provenanceCaption,
  correctionsCaption,
}: {
  children: ReactNode;
  loadingLabel: string;
  provenanceCaption: string;
  correctionsCaption: string;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();

  return (
    <div ref={ref}>
      {inView ? (
        <Suspense fallback={<Loading label={loadingLabel}>{children}</Loading>}>
          <TrustNote
            provenanceCaption={provenanceCaption}
            correctionsCaption={correctionsCaption}
          />
        </Suspense>
      ) : (
        children
      )}
    </div>
  );
}

/**
 * The static version stays on screen while the chunk arrives, with a quiet status line above it.
 * Swapping it for a spinner would make the section flash empty on a slow connection, and the reader
 * would lose the paragraph they were halfway through.
 */
function Loading({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p role="status" className="mb-4 text-center text-sm text-text-muted">
        {label}
      </p>
      {children}
    </div>
  );
}
