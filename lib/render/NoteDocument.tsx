'use client';

import { Fragment } from 'react';

import { cn } from '@/lib/utils/cn';
import type {
  Block,
  MarginNoteBlock,
  NoteDocument as NoteDocumentType,
  Section,
} from '@/lib/ai/schema';

import { CorrectionsPanel } from './corrections-panel';
import { EndNotes } from './end-notes';
import { GlossaryList } from './glossary-list';
import { OpenQuestionsPanel } from './open-questions-panel';
import { OutlineRail, buildOutline } from './outline-rail';
import { ReadingModeProvider, useReadingMode } from './reading-mode';
import { ReadingModeToggle } from './reading-mode-toggle';
import { RenderBlock, isFigure } from './blocks';
import { MarginNote } from './margin-note';
import { VerifyBadge } from './verify-badge';
import { renderInline, stripInline } from './markdown/inline';

export interface NoteDocumentProps {
  doc: NoteDocumentType;
  /**
   * Streaming: the document is still arriving, so appendices that are only meaningful when
   * complete (corrections, glossary) stay hidden rather than flickering in half-finished — and
   * each section fades up as it lands (03-DESIGN.md §7).
   */
  partial?: boolean;
  /** Hides the chrome the print stylesheet replaces: the outline rail and the reading toggle. */
  forPrint?: boolean;
  className?: string;
}

/**
 * The finished note (03-DESIGN.md §6, 06 §1). A pure function of `doc` — no fetching, no stores.
 * The read view, the streaming view, the share page and the print route are all this component
 * with different CSS and a different `doc`.
 *
 * The layout is two nested grids. The outer one parks the outline rail beside the article; the
 * inner one, inside each section, puts the text in a column of `--measure` and margin notes in a
 * `--margin-col` beside it, aligned to the block they annotate. Below 1100px both collapse and the
 * margin notes fold into `<details>` — see `MarginNote`.
 */
export function NoteDocument({
  doc,
  partial = false,
  forPrint = false,
  className,
}: NoteDocumentProps) {
  return (
    <ReadingModeProvider>
      <NoteBody doc={doc} partial={partial} forPrint={forPrint} className={className} />
    </ReadingModeProvider>
  );
}

function NoteBody({
  doc,
  partial,
  forPrint,
  className,
}: Required<Omit<NoteDocumentProps, 'className'>> & { className?: string }) {
  const { shouldRender } = useReadingMode();
  const outline = buildOutline(doc);
  const figureNumbers = assignFigureNumbers(doc.sections);
  // Printing turns every margin note into a numbered endnote; on screen the map is empty and the
  // notes render in the margin as usual.
  const endnotes = forPrint ? collectMarginNotes(doc.sections) : [];
  const endnoteNumbers = new Map(endnotes.map((note, index) => [note, index + 1]));

  return (
    <div className={cn('lumen-note mx-auto w-full max-w-(--note-shell) px-5 py-10', className)}>
      <div data-note-layout="shell" className="gap-12 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)]">
        {forPrint ? null : <OutlineRail entries={outline} />}

        <article className="min-w-0">
          <header className="mb-10">
            {/* `string-set` in print.css lifts this into the running header on every page. */}
            <p data-print-course className="font-sans text-sm tracking-wide text-text-muted">
              {[doc.context.course, doc.context.unit].filter(Boolean).join(' · ')}
            </p>
            <h1 className="mt-2 max-w-(--measure) font-serif text-3xl leading-tight font-semibold text-balance text-text">
              {doc.title}
            </h1>

            {forPrint ? null : (
              <div className="mt-6 border-y border-border py-4">
                <ReadingModeToggle />
              </div>
            )}
          </header>

          {doc.summary ? (
            <section aria-label="Summary" className="mb-8 max-w-(--measure)">
              <h2 className="mb-2 font-sans text-xs font-semibold tracking-wider text-text-muted uppercase">
                In one paragraph
              </h2>
              <p className="text-md leading-note text-text">
                {renderInline(doc.summary, 'summary')}
              </p>
            </section>
          ) : null}

          {doc.objectives.length ? (
            <section aria-label="Learning objectives" className="mb-10 max-w-(--measure)">
              <h2 className="mb-2 font-sans text-xs font-semibold tracking-wider text-text-muted uppercase">
                By the end you can
              </h2>
              <ul className="flex list-disc flex-col gap-1.5 pl-5 marker:text-accent">
                {doc.objectives.map((objective, index) => (
                  <li key={index} className="leading-note">
                    {renderInline(objective, `obj-${index}`)}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {doc.sections.map((section) => (
            <SectionView
              key={section.id}
              section={section}
              flags={doc.factCheck.flags.filter((flag) => flag.sectionId === section.id)}
              figureNumbers={figureNumbers}
              endnoteNumbers={endnoteNumbers}
              shouldRender={shouldRender}
              reveal={partial}
            />
          ))}

          {partial ? null : (
            <div className="max-w-(--measure)">
              <EndNotes notes={endnotes} />
              <CorrectionsPanel corrections={doc.corrections} />
              <OpenQuestionsPanel questions={doc.openQuestions} />
              <GlossaryList entries={doc.glossary} />

              {doc.furtherStudy?.length ? (
                <section aria-labelledby="further-study-heading" className="mt-10">
                  <div className="mb-4 border-t border-border pt-6">
                    <h2
                      id="further-study-heading"
                      className="font-serif text-xl font-semibold text-text"
                    >
                      Study next
                    </h2>
                  </div>
                  <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-text-muted">
                    {doc.furtherStudy.map((item, index) => (
                      <li key={index} className="leading-note">
                        {renderInline(item, `next-${index}`)}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {/* 06 §5.4 — the standing disclaimer. Honest, specific, and not an excuse. */}
              <footer className="mt-12 border-t border-border pt-5 font-sans text-xs leading-snug text-text-muted">
                Lumen rebuilt these notes with AI. It checks its work, but it can still be wrong.
                Verify anything important against your textbook and your teacher — especially the
                items marked to check.
              </footer>
            </div>
          )}
        </article>
      </div>
    </div>
  );
}

function SectionView({
  section,
  flags,
  figureNumbers,
  endnoteNumbers,
  shouldRender,
  reveal,
}: {
  section: Section;
  flags: NoteDocumentType['factCheck']['flags'];
  figureNumbers: Map<Block, number>;
  endnoteNumbers: Map<MarginNoteBlock, number>;
  shouldRender: (origin: Block['origin']) => boolean;
  /** Fade the section up as it arrives. Only while streaming — the finished note is just there. */
  reveal: boolean;
}) {
  const rows = groupBlocks(section.blocks.filter((block) => shouldRender(block.origin)));
  const Heading = section.level === 2 ? 'h2' : 'h3';

  // "My original" can empty a section completely; an empty heading with a rule under it looks
  // like a rendering bug rather than a deliberate view.
  if (rows.length === 0) return null;

  return (
    // A CSS animation, not a JS one: it runs once when the element mounts, which *is* "as its
    // first block arrives", and globals.css already neutralises it under reduced motion.
    <section
      aria-labelledby={section.id}
      className={cn('mt-12 first:mt-0', reveal && 'animate-reveal')}
    >
      <Heading
        id={section.id}
        className={cn(
          'max-w-(--measure) scroll-mt-8 border-t border-border pt-6 font-serif text-text',
          section.level === 2 ? 'text-2xl font-semibold' : 'text-lg font-semibold tracking-wide',
        )}
      >
        {section.title}
      </Heading>

      {flags.length ? (
        <div className="max-w-(--measure)">
          <VerifyBadge flags={flags} />
        </div>
      ) : null}

      <div
        data-note-layout="section"
        className={cn(
          'mt-4 grid grid-cols-1 gap-x-10',
          'note:grid-cols-[minmax(0,var(--measure))_var(--margin-col)]',
        )}
      >
        {rows.map((row, index) => {
          const notes = row.notes.map((note, noteIndex) => (
            <MarginNote key={noteIndex} block={note} printNumber={endnoteNumbers.get(note)} />
          ));

          // Figures take the measure *and* the margin column. A five-node flowchart squeezed into
          // 68ch comes out at 9px type; a textbook would let it run wide, and so do we.
          return isFigure(row.block) ? (
            <div key={index} className="col-start-1 min-w-0 note:col-span-2">
              <RenderBlock block={row.block} figureNumber={figureNumbers.get(row.block) ?? 1} />
              {notes}
            </div>
          ) : (
            <Fragment key={index}>
              <div className="col-start-1 min-w-0">
                <RenderBlock block={row.block} figureNumber={figureNumbers.get(row.block) ?? 1} />
              </div>
              <div className="note:col-start-2 note:pt-1">{notes}</div>
            </Fragment>
          );
        })}
      </div>
    </section>
  );
}

interface BlockRow {
  block: Block;
  notes: MarginNoteBlock[];
}

/**
 * Attaches each margin note to the block it annotates — the block it follows in source order.
 *
 * `MarginNoteBlock.anchorId` is meant to name its target explicitly, but `Block` carries no `id`
 * in the current schema, so there is nothing for it to point at. Source order is the reliable
 * signal today and produces the same result for every note in the gold fixture. When phase-04
 * gives blocks ids, resolve `anchorId` first here and keep this as the fallback.
 *
 * A note with nothing before it is held back and attached to the first real block, so it never
 * lands beside the heading where it would read as a subtitle.
 */
function groupBlocks(blocks: Block[]): BlockRow[] {
  const rows: BlockRow[] = [];
  const orphans: MarginNoteBlock[] = [];

  for (const block of blocks) {
    if (block.type === 'marginNote') {
      const target = rows.at(-1);
      if (target) target.notes.push(block);
      else orphans.push(block);
      continue;
    }
    rows.push({ block, notes: rows.length === 0 ? orphans.splice(0) : [] });
  }

  // Nothing but margin notes in the section — render them in the text column rather than lose them.
  if (rows.length === 0 && orphans.length) {
    return orphans.map((note) => ({ block: note, notes: [] }));
  }
  return rows;
}

/** Margin notes in reading order, for the printed endnote list. */
function collectMarginNotes(sections: Section[]): MarginNoteBlock[] {
  return sections.flatMap((section) =>
    section.blocks.filter((block): block is MarginNoteBlock => block.type === 'marginNote'),
  );
}

/** Figures are numbered across the whole document, not per section — the way a textbook does it. */
function assignFigureNumbers(sections: Section[]): Map<Block, number> {
  const numbers = new Map<Block, number>();
  let next = 1;
  for (const section of sections) {
    for (const block of section.blocks) {
      if (isFigure(block)) numbers.set(block, next++);
    }
  }
  return numbers;
}

/** Plain-text title, for `<title>`, share cards and export filenames. */
export function noteTitle(doc: NoteDocumentType): string {
  return stripInline(doc.title);
}
