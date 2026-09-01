'use client';

import Image from 'next/image';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { BookIcon, FlaskIcon, SparkIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils/cn';
import { appStrings } from '@/lib/app/strings';

export interface NoteCardProps {
  title: string;
  course: string;
  unit?: string | null;
  /** ISO date; formatted here so the library shows one date format. */
  updatedAt: string;
  aiAdded: number;
  openQuestions: number;
  href: string;
  /** Not yet synced to an account — lives only in this browser (02-ARCHITECTURE.md §4). */
  localOnly?: boolean;
  thumbnailUrl?: string | null;
  exported?: boolean;
  inNotion?: boolean;
  conflicted?: boolean;
  className?: string;
}

/**
 * One note in the library. The whole card is a link, with the counts as text rather than as bare
 * numbers so a screen reader gets "4 corrections" and not "4".
 *
 * Corrections are shown as a positive count, not a warning: 06 §5.6 is right that students find
 * the number satisfying, and framing it as damage would make people stop looking at it.
 */
export function NoteCard({
  title,
  course,
  unit,
  updatedAt,
  aiAdded,
  openQuestions,
  href,
  localOnly = false,
  thumbnailUrl,
  exported = false,
  inNotion = false,
  conflicted = false,
  className,
}: NoteCardProps) {
  return (
    <Card interactive padding="none" className={cn('font-sans', className)}>
      <a href={href} className="flex flex-col gap-2.5 p-4 no-underline">
        {thumbnailUrl ? (
          <div className="relative aspect-[8/5] overflow-hidden rounded-note border border-border bg-bg-sunken">
            <Image
              src={thumbnailUrl}
              alt=""
              fill
              unoptimized
              sizes="(max-width: 640px) 100vw, 20rem"
              className="object-cover object-top"
            />
          </div>
        ) : null}
        <div className="flex items-start gap-2.5">
          <span aria-hidden="true" className="mt-0.5 text-base text-accent">
            {course.toLowerCase().includes('chem') ? <FlaskIcon /> : <BookIcon />}
          </span>
          <div className="min-w-0">
            <p className="line-clamp-2 text-sm leading-snug font-medium text-text">{title}</p>
            <p className="mt-0.5 truncate text-xs text-text-muted">
              {[course, unit].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {aiAdded > 0 ? (
            <Badge tone="accent" icon={<SparkIcon />}>
              {appStrings.library.aiAdded(aiAdded)}
            </Badge>
          ) : null}
          {openQuestions > 0 ? (
            <Badge tone="warning">{appStrings.library.openQuestions(openQuestions)}</Badge>
          ) : null}
          {exported ? <Badge tone="success">{appStrings.library.exported}</Badge> : null}
          {inNotion ? <Badge tone="success">{appStrings.library.inNotion}</Badge> : null}
          {localOnly ? <Badge>{appStrings.library.localOnly}</Badge> : null}
          {conflicted ? <Badge tone="danger">{appStrings.library.conflicted}</Badge> : null}
        </div>

        <p className="text-xs text-text-muted">
          <time dateTime={updatedAt}>
            {appStrings.library.updated(
              new Date(updatedAt).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              }),
            )}
          </time>
        </p>
      </a>
    </Card>
  );
}
