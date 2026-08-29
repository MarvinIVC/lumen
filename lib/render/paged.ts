'use client';

/**
 * paged.js, dynamically imported (06 §2).
 *
 * It gives the printed note the things `window.print()` alone cannot: real page boxes, a running
 * header taking the course and unit from the document, and folios. It rewrites the DOM into
 * `.pagedjs_page` elements, so it must run once, after React has finished — which is why the
 * print route renders a static tree and never re-renders under it.
 */

interface PreviewerLike {
  preview: (
    content?: DocumentFragment | HTMLElement,
    stylesheets?: string[],
    renderTo?: HTMLElement,
  ) => Promise<unknown>;
}

/**
 * The page box, handed to paged.js directly.
 *
 * paged.js only generates margin boxes for `@page` rules its own polisher has parsed, and the
 * polisher only sees the stylesheets passed to `preview()`. Passing `[]` leaves it with no CSS at
 * all: the document's styles still paint the content, so the preview looks right, and the running
 * header and folios come out silently empty. Passing `undefined` makes it swallow and re-emit the
 * whole app stylesheet, which is both slow and fragile against a bundler.
 *
 * So the page geometry lives here, as the one piece of CSS paged.js is given. It has to agree
 * with the `@page` block in print.css, which is what a browser printing *without* paged.js uses.
 *
 * Worth knowing when testing this: paged.js builds the margin boxes as real elements but fills
 * them through a CSS `content:` pseudo-element. The running header and the folio are therefore
 * invisible to `textContent`, and to anything built on it — a Playwright `toContainText` will say
 * the page is empty while the header is plainly on screen. Read the computed `content` instead.
 */
const PAGE_CSS = `
@page {
  size: A4;
  margin: 20mm 18mm 22mm;
  @top-left {
    content: string(course);
    font-family: var(--font-sans);
    font-size: 9pt;
    color: var(--text-muted);
  }
  @bottom-right {
    content: counter(page);
    font-family: var(--font-sans);
    font-size: 9pt;
    color: var(--text-muted);
  }
}
@page :first {
  @top-left { content: ''; }
}
[data-print-course] { string-set: course content(); }
`;

let started = false;

/**
 * Lays the note out into pages. Safe to call twice — the second call is ignored, because paged.js
 * consuming its own output produces one page containing a picture of a page.
 */
export async function paginate(source: HTMLElement, target: HTMLElement): Promise<void> {
  if (started) return;
  started = true;

  const { Previewer } = (await import('pagedjs')) as unknown as {
    Previewer: new () => PreviewerLike;
  };

  const content = source.cloneNode(true) as HTMLElement;
  source.remove();
  const pageStyles = URL.createObjectURL(new Blob([PAGE_CSS], { type: 'text/css' }));
  try {
    await new Previewer().preview(content, [pageStyles], target);
  } finally {
    URL.revokeObjectURL(pageStyles);
  }
}
