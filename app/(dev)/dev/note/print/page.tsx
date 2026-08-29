'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { NoteDocument } from '@/lib/render/NoteDocument';
import { goldFixture } from '@/lib/render/fixture/gold';
import { paginate } from '@/lib/render/paged';

/**
 * The `/print` variant (06 §2). Same renderer, `forPrint` on, and paged.js laying it into real
 * pages so the running header, the folios and the page breaks are visible on screen before anyone
 * reaches for Ctrl-P.
 *
 * The document is rendered once into a source node; paged.js consumes that node and writes the
 * paginated result into the target. Nothing re-renders underneath it afterwards, which is the one
 * rule that keeps React and paged.js out of each other's way.
 */
export default function PrintPage() {
  const source = useRef<HTMLDivElement>(null);
  const target = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  // The stylesheet keys off this rather than off `@media print`, so the on-screen pagination and
  // the printed page are laid out by the same rules. See print.css.
  useEffect(() => {
    document.documentElement.setAttribute('data-print', '');
    return () => document.documentElement.removeAttribute('data-print');
  }, []);

  useEffect(() => {
    const from = source.current;
    const to = target.current;
    if (!from || !to) return;

    // Fonts and KaTeX both change line breaking, and paged.js measures once. Laying out before
    // they land produces pages that are subtly wrong in a way nobody notices until it is printed.
    const timer = window.setTimeout(() => {
      void document.fonts.ready.then(() => paginate(from, to)).then(() => setReady(true));
    }, 800);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <div
        data-print-hide
        className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-border bg-bg/90 px-5 py-3 backdrop-blur-sm"
      >
        <p className="font-sans text-sm text-text-muted">
          {ready ? 'Laid out into pages.' : 'Laying out…'} Print this page to get the PDF.
        </p>
        <Button variant="primary" size="sm" onClick={() => window.print()}>
          Print
        </Button>
      </div>

      <div ref={source}>
        <NoteDocument doc={goldFixture()} forPrint />
      </div>
      <div ref={target} className="py-8" />
    </>
  );
}
