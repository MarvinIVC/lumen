'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BookIcon, FlaskIcon, SparkIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils/cn';
import type { NoteContext } from '@/lib/ai/schema';

const CURRICULUM_LABELS: Record<NoteContext['curriculum'], string> = {
  AP: 'AP',
  IB_HL: 'IB HL',
  IB_SL: 'IB SL',
  A_LEVEL: 'A-Level',
  IGCSE: 'IGCSE',
  INTERNAL: 'School course',
  GENERAL: 'General',
  UNKNOWN: 'Not sure yet',
};

export interface ContextCardProps {
  context: NoteContext;
  /** 0–1 from the detection pass. Below ~0.6 the card asks rather than asserts. */
  confidence?: number;
  /** Name of the curriculum pack that matched, if any. */
  packName?: string | null;
  onEdit?: () => void;
  className?: string;
}

/**
 * What we think these notes are (04-AI-ENGINE.md §3), shown back before anything is generated.
 *
 * The tone shifts with confidence, and that is the whole design of this component. When we are
 * sure, it states what it found and offers a quiet "change". When we are not, it says so plainly
 * and asks — because a wrong course silently chosen produces a study guide aimed at the wrong
 * exam, and the student has no way to know why.
 */
export function ContextCard({
  context,
  confidence = 1,
  packName,
  onEdit,
  className,
}: ContextCardProps) {
  const unsure = confidence < 0.6;

  return (
    <div
      role="group"
      aria-label="What we think these notes are"
      className={cn(
        'flex flex-col gap-3 rounded-md border bg-bg-raised p-4 font-sans',
        unsure ? 'border-warning/50' : 'border-border',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="text-lg text-accent">
            {context.subject.toLowerCase().includes('chem') ? <FlaskIcon /> : <BookIcon />}
          </span>
          <div>
            <p className="text-sm font-medium text-text">{context.course}</p>
            <p className="text-xs text-text-muted">
              {[CURRICULUM_LABELS[context.curriculum], context.unit, context.topic]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
        {onEdit ? (
          <Button size="sm" variant="ghost" onClick={onEdit}>
            {unsure ? 'Set it' : 'Change'}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge>{context.subject}</Badge>
        {packName ? (
          <Badge tone="accent" icon={<SparkIcon />}>
            {packName}
          </Badge>
        ) : null}
        <Badge>{context.language.toUpperCase()}</Badge>
      </div>

      {unsure ? (
        <p className="text-xs leading-snug text-text-muted">
          We are guessing — your notes did not say. Setting the course picks the right vocabulary
          and the right exam conventions, so it is worth ten seconds.
        </p>
      ) : null}
    </div>
  );
}
