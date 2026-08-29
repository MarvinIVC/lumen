'use client';

import { Chip } from '@/components/ui/chip';
import { cn } from '@/lib/utils/cn';

export interface Subject {
  id: string;
  label: string;
  /** A glyph from icons.tsx. Decorative — the label carries the meaning. */
  icon?: React.ReactNode;
}

export interface SubjectPickerProps {
  subjects: Subject[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}

/**
 * "If you take notes on it, Lumen cleans it up" (00-BRIEF.md) — so the picker has to make the
 * breadth visible without turning into a wall. Chips in one wrapping row, and the list is short
 * because the combobox behind it handles the long tail.
 */
export function SubjectPicker({ subjects, selectedId, onSelect, className }: SubjectPickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Subject"
      className={cn('flex flex-wrap gap-2 font-sans', className)}
    >
      {subjects.map((subject) => (
        <Chip
          key={subject.id}
          icon={subject.icon}
          selected={subject.id === selectedId}
          onSelect={() => onSelect(subject.id)}
        >
          {subject.label}
        </Chip>
      ))}
    </div>
  );
}
