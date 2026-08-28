'use client';

import { useEffect, useState } from 'react';

import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { PanelLeftIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils/cn';
import type { NoteDocument as NoteDocumentType } from '@/lib/ai/schema';

export interface OutlineEntry {
  id: string;
  title: string;
  level: 2 | 3;
  /** The section contains an AI addition or an open question — worth a dot in the rail (§6). */
  marked: boolean;
}

/** Derived from the document rather than from the DOM, so it is identical on server and client. */
export function buildOutline(doc: NoteDocumentType): OutlineEntry[] {
  const flagged = new Set(doc.openQuestions.map((question) => question.sectionId));
  for (const flag of doc.factCheck.flags) flagged.add(flag.sectionId);

  return doc.sections.map((section) => ({
    id: section.id,
    title: section.title,
    level: section.level,
    marked:
      flagged.has(section.id) ||
      section.blocks.some(
        (block) => block.origin === 'ai-added' || block.origin === 'ai-corrected',
      ),
  }));
}

/**
 * The outline (03-DESIGN.md §6): fixed to the left on a desktop, a sheet you pull down on a
 * phone. The dot beside a title means "something in here was added or is worth checking" — it is
 * the fastest way to answer "what did it change?" without turning on Highlight AI.
 */
export function OutlineRail({
  entries,
  className,
}: {
  entries: OutlineEntry[];
  className?: string;
}) {
  const activeId = useActiveSection(entries.map((entry) => entry.id));

  if (entries.length === 0) return null;

  return (
    <>
      <nav
        aria-label="Sections"
        className={cn('hidden lg:sticky lg:top-8 lg:block lg:self-start', className)}
      >
        <OutlineList entries={entries} activeId={activeId} />
      </nav>

      <div className="mb-6 lg:hidden">
        <Drawer>
          <DrawerTrigger asChild>
            <Button size="sm" icon={<PanelLeftIcon />}>
              Outline
            </Button>
          </DrawerTrigger>
          <DrawerContent side="left" title="Sections" description="Jump to a part of this note.">
            <OutlineList entries={entries} activeId={activeId} />
          </DrawerContent>
        </Drawer>
      </div>
    </>
  );
}

function OutlineList({ entries, activeId }: { entries: OutlineEntry[]; activeId: string | null }) {
  return (
    <ol className="flex flex-col gap-0.5 font-sans text-sm">
      {entries.map((entry) => (
        <li key={entry.id}>
          <a
            href={`#${entry.id}`}
            aria-current={entry.id === activeId ? 'true' : undefined}
            className={cn(
              'flex items-center gap-2 rounded-sm py-1.5 pr-2 no-underline',
              'transition-colors duration-(--dur-fast) ease-lumen',
              entry.level === 3 ? 'pl-5' : 'pl-3',
              entry.id === activeId
                ? 'bg-accent-weak font-medium text-accent'
                : 'text-text-muted hover:text-text',
            )}
          >
            <span className="flex-1 leading-snug">{entry.title}</span>
            {entry.marked ? (
              <span
                className="size-1.5 shrink-0 rounded-full bg-accent"
                title="Contains an addition or something to check"
              />
            ) : null}
          </a>
        </li>
      ))}
    </ol>
  );
}

/**
 * Highlights the section currently being read. Uses an IntersectionObserver rather than scroll
 * maths so it costs nothing while the page is still, and degrades to "nothing highlighted" where
 * the API is unavailable — which is a fine outcome for a wayfinding nicety.
 */
function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join('|');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      // Only the top third counts as "here", so the heading you just scrolled past stops winning.
      { rootMargin: '0px 0px -66% 0px', threshold: 0 },
    );

    for (const id of key.split('|')) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [key]);

  return active;
}
