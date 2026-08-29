'use client';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { BookIcon, FlaskIcon, SparkIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils/cn';

export interface NoteCardProps {
  title: string;
  course: string;
  unit?: string | null;
  /** ISO date; formatted here so the library shows one date format. */
  updatedAt: string;
  corrections: number;
  openQuestions: number;
  href: string;
  /** Not yet synced to an account — lives only in this browser (02-ARCHITECTURE.md §4). */
  localOnly?: boolean;
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
  corrections,
  openQuestions,
  href,
  localOnly = false,
  className,
}: NoteCardProps) {
  return (
    <Card interactive padding="none" className={cn('font-sans', className)}>
      <a href={href} className="flex flex-col gap-2.5 p-4 no-underline">
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
          {corrections > 0 ? (
            <Badge tone="accent" icon={<SparkIcon />}>
              {corrections} {corrections === 1 ? 'correction' : 'corrections'}
            </Badge>
          ) : null}
          {openQuestions > 0 ? <Badge tone="warning">{openQuestions} to confirm</Badge> : null}
          {localOnly ? <Badge>This browser only</Badge> : null}
        </div>

        <p className="text-xs text-text-muted">
          Updated{' '}
          <time dateTime={updatedAt}>
            {new Date(updatedAt).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </time>
        </p>
      </a>
    </Card>
  );
}
