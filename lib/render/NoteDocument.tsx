'use client';

import { Fragment } from 'react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';
import { toMyOriginal } from '@/lib/notes/reading';
import type {
  Block,
  MarginNoteBlock,
  NoteDocument as NoteDocumentType,
  Section,
} from '@/lib/ai/schema';
import type { ReadingMode } from './reading-mode';

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
  /** Set to drive the reading mode from outside — the workspace's action bar does (phase-05 §2). */
  mode?: ReadingMode;
  onModeChange?: (mode: ReadingMode) => void;
  /** Renders per-block chrome — the accept/reject controls the read view offers on AI blocks. */
  blockActions?: (block: Block) => ReactNode;
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
  mode,
  onModeChange,
  blockActions,
  className,
}: NoteDocumentProps) {
  return (
    <ReadingModeProvider {...(mode ? { mode } : {})} {...(onModeChange ? { onModeChange } : {})}>
      <NoteBody
        doc={doc}
        partial={partial}
        forPrint={forPrint}
        controlled={mode !== undefined}
        {...(blockActions ? { blockActions } : {})}
        className={className}
      />
    </ReadingModeProvider>
  );
}

function NoteBody({
  doc: source,
  partial,
  forPrint,
  controlled,
  blockActions,
  className,
}: {
  doc: NoteDocumentType;
  partial: boolean;
  forPrint: boolean;
  /** True when the toggle lives outside this component and must not be drawn again. */
  controlled: boolean;
  blockActions?: (block: Block) => ReactNode;
  className?: string;
}) {
  const { mode, shouldRender } = useReadingMode();
  // "My original" is a different document, not a filtered view of this one — the student's own
  // wording for anything we corrected exists only inside `originalText` and has to be spliced back
  // in. `lib/notes/reading.ts` carries the case that proved it.
  const doc = mode === 'my-original' ? toMyOriginal(source) : source;
  const outline = buildOutline(doc);
  const figureNumbers = assignFigureNumbers(doc.sections);
  // Printing turns every margin note into a numbered endnote; on screen the map is empty and the
  // notes render in the margin as usual.
  const endnotes = forPrint ? collectMarginNotes(doc.sections) : [];
  const endnoteNumbers = new Map(endnotes.map((note, index) => [note, index + 1]));
  const anchors = buildAnchors(doc);

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

            {forPrint || controlled ? null : (
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
              {...(blockActions ? { blockActions } : {})}
              reveal={partial}
            />
          ))}

          {partial ? null : (
            <div className="max-w-(--measure)">
              <EndNotes notes={endnotes} />
              <CorrectionsPanel corrections={doc.corrections} anchorFor={anchors.correction} />
              <OpenQuestionsPanel questions={doc.openQuestions} anchorFor={anchors.question} />
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
  blockActions,
  reveal,
}: {
  section: Section;
  flags: NoteDocumentType['factCheck']['flags'];
  figureNumbers: Map<Block, number>;
  endnoteNumbers: Map<MarginNoteBlock, number>;
  shouldRender: (origin: Block['origin']) => boolean;
  blockActions?: (block: Block) => ReactNode;
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
          const body = (
            <>
              <RenderBlock block={row.block} figureNumber={figureNumbers.get(row.block) ?? 1} />
              {blockActions?.(row.block)}
            </>
          );

          return isFigure(row.block) ? (
            <div
              key={index}
              id={row.block.id}
              className="col-start-1 min-w-0 scroll-mt-24 note:col-span-2"
            >
              {body}
              {notes}
            </div>
          ) : (
            <Fragment key={index}>
              <div id={row.block.id} className="col-start-1 min-w-0 scroll-mt-24">
                {body}
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

/**
 * Where a correction and an open question point to.
 *
 * A correction is matched to the block that carries its `originalText`, which is the strongest
 * link available: 04 §5 requires every correction to have a matching inline `ai-corrected` mark,
 * and phase-04 confirmed both fields are populated in the deployed output. Falling back to the
 * section heading is not a lesser answer for an open question — those are about a section rather
 * than about one sentence — and for a correction it is the honest one when the text has since been
 * edited away.
 */
function buildAnchors(doc: NoteDocumentType) {
  const byOriginal = new Map<string, string>();
  for (const section of doc.sections) {
    for (const block of section.blocks) {
      const original = block.originalText?.trim();
      if (original && block.id && !byOriginal.has(original)) byOriginal.set(original, block.id);
    }
  }
  const sections = new Set(doc.sections.map((section) => section.id));

  return {
    correction: (correction: NoteDocumentType['corrections'][number]) =>
      byOriginal.get(correction.original.trim()) ??
      (sections.has(correction.sectionId) ? correction.sectionId : null),
    question: (question: NoteDocumentType['openQuestions'][number]) =>
      sections.has(question.sectionId) ? question.sectionId : null,
  };
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
