'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FileIcon } from '@/components/ui/icons';
import { NoteDocument } from '@/lib/render/NoteDocument';
import { appStrings } from '@/lib/app/strings';
import { noteHref } from '@/lib/app/routes';
import { paginate } from '@/lib/render/paged';
import { loadNote } from '@/lib/store/drafts';
import type { LocalNote } from '@/lib/store/types';

/**
 * Resolves once `count()` has stopped changing — the dynamic renderers have all landed and the
 * DOM is done growing. Gives up after `limit` so a page that never settles still prints.
 *
 * This is the phase-03 lesson in a different costume: a flat timeout is a guess that is too long
 * on a fast machine and too short on a slow one, and on CI it paginated nothing at all.
 */
async function settled(count: () => number, step = 120, limit = 8000): Promise<void> {
  const deadline = Date.now() + limit;
  let previous = -1;

  while (Date.now() < deadline) {
    const current = count();
    if (current > 0 && current === previous) return;
    previous = current;
    await new Promise((resolve) => window.setTimeout(resolve, step));
  }
}

/**
 * `/app/note/:id/print` — the PDF (06 §2).
 *
 * There is no server-side PDF renderer and there is deliberately not going to be one: the browser
 * already has a typesetter that produces selectable vector text with real KaTeX and real SVG, and
 * `window.print()` reaches it. paged.js supplies what printing alone cannot — page boxes, the
 * running header, folios — and `print.css` carries the rest.
 *
 * The document is rendered once into a source node; paged.js consumes that node and writes the
 * paginated result into the target. **Nothing re-renders underneath it afterwards**, which is the
 * one rule that keeps React and paged.js out of each other's way — paged.js rewrites the DOM into
 * `.pagedjs_page` elements, and a React re-render would be writing into a tree it no longer owns.
 */
export function PrintScreen({ noteId }: { noteId: string }) {
  const [note, setNote] = useState<LocalNote | null | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const source = useRef<HTMLDivElement>(null);
  const target = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadNote(noteId).then(setNote);
  }, [noteId]);

  // The stylesheet keys off this rather than off `@media print`, so the on-screen pagination and
  // the printed page are laid out by the same rules. See print.css.
  useEffect(() => {
    document.documentElement.setAttribute('data-print', '');
    return () => document.documentElement.removeAttribute('data-print');
  }, []);

  const doc = note?.generated;

  useEffect(() => {
    if (!doc) return;
    const from = source.current;
    const to = target.current;
    if (!from || !to) return;

    let cancelled = false;

    // Fonts and KaTeX both change line breaking, and paged.js measures once — laying out before
    // they land produces pages that are subtly wrong in a way nobody notices until it is printed.
    void settled(
      () => from.querySelectorAll('.katex, .lumen-diagram svg, svg.lumen-structure').length,
    )
      .then(() => document.fonts.ready)
      .then(() => (cancelled ? undefined : paginate(from, to)))
      .then(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [doc]);

  if (note === undefined) return null;

  if (!doc) {
    return (
      <EmptyState
        icon={<FileIcon />}
        title={appStrings.print.nothingTitle}
        description={appStrings.print.nothingBody}
        action={
          <Button asChild variant="primary">
            <Link href={noteHref(noteId)}>{appStrings.print.backToNote}</Link>
          </Button>
        }
      />
    );
  }

  return (
    <>
      <div
        data-print-hide
        className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-border bg-bg/90 px-5 py-3 backdrop-blur-sm"
      >
        <p className="font-sans text-sm text-text-muted">
          {ready ? appStrings.print.ready : appStrings.print.laying}
        </p>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href={noteHref(noteId)}>{appStrings.print.backToNote}</Link>
          </Button>
          <Button variant="primary" size="sm" disabled={!ready} onClick={() => window.print()}>
            {appStrings.print.print}
          </Button>
        </div>
      </div>

      <div ref={source}>
        <NoteDocument doc={doc} forPrint />
      </div>
      <div ref={target} className="py-8" />
    </>
  );
}
