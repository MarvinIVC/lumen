import { cn } from '@/lib/utils/cn';

import { HERO_RAW_EXCERPT, excerptLines } from '../excerpts';

/**
 * The left-hand panel: topic 1.1 exactly as the student typed it, dressed as the page it came off.
 *
 * The text is sliced out of `fixtures/ap-chem-u1-raw.md` rather than retyped (see `excerpts.ts`),
 * so the hero's central claim — that this is a real file — cannot quietly stop being true.
 *
 * Styled as a typed document, not handwriting: the source really was a .docx, and a handwriting
 * font would be both an illustration cliché (03-DESIGN.md §1) and a small lie about the input.
 * What sells "messy" is the tight leading, the ragged indentation and the run-on lines — which are
 * the file's own, not ours.
 */
export function RawPage({ caption, label }: { caption: string; label: string }) {
  const lines = excerptLines(HERO_RAW_EXCERPT);

  return (
    <div className="flex h-full flex-col p-4 sm:p-8">
      {/* Only shown when the panels stack and the pinned corner labels no longer point at the
          right one — see the labels block in `hero-scrubber.tsx`. */}
      <PanelLabel className="mb-3 sm:hidden">{label}</PanelLabel>

      {/*
        The card fills the panel rather than sitting in the middle of it. The comparison box is as
        tall as the finished note, which is much the longer of the two documents, and a short card
        floating in the centre of all that space read as a layout bug. Filling it reads as what it
        is: a page that runs out before the lesson does.
      */}
      <div className="flex min-h-0 grow -rotate-1">
        <div className="flex grow flex-col overflow-hidden rounded-sm border border-border bg-bg-raised shadow-card">
          <p className="truncate border-b border-border px-4 py-2 font-mono text-xs text-text-muted">
            {caption}
          </p>

          {/* text-sm/6 is a 24px line box, which is what --raw-rule is set to. Every child below
              keeps that rhythm exactly — a stray margin puts the rules through the words. */}
          <div className="lumen-raw-page grow px-4 py-3 font-sans text-sm/6 text-text">
            {lines.map((line, index) => (
              <RawLine key={index} line={line} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * One line of the notes. Markdown's `##` and `-` are the only syntax in the fixture; everything
 * else is rendered as typed, wrapping included. An empty line is a real empty line — the gaps in
 * the original are part of what makes it look like this.
 */
function RawLine({ line }: { line: string }) {
  if (line.trim() === '') return <div aria-hidden="true" className="h-6" />;

  if (line.startsWith('## ')) {
    return <p className="font-semibold">{line.slice(3)}</p>;
  }

  if (line.startsWith('- ')) {
    return (
      <p className="flex gap-2 pl-3">
        <span aria-hidden="true" className="text-text-muted">
          •
        </span>
        <span className="min-w-0">{line.slice(2)}</span>
      </p>
    );
  }

  // Continuation of a wrapped bullet in the source file — the original's own hanging indent.
  if (line.startsWith('  ')) {
    return <p className="pl-8 break-words">{line.trim()}</p>;
  }

  return <p className="break-words">{line}</p>;
}

/** The chip that names each side of the comparison. */
export function PanelLabel({
  children,
  tone = 'muted',
  className,
}: {
  children: React.ReactNode;
  tone?: 'muted' | 'accent';
  className?: string;
}) {
  return (
    <p
      className={cn(
        'inline-flex w-fit rounded-sm px-2 py-1 font-mono text-xs tracking-widest uppercase',
        tone === 'accent' ? 'bg-accent-weak text-text' : 'bg-bg-sunken text-text-muted',
        className,
      )}
    >
      {children}
    </p>
  );
}
