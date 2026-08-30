'use client';

import { useMemo } from 'react';

import { Badge } from '@/components/ui/badge';
import { Combobox } from '@/components/ui/combobox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectItem } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { SparkIcon } from '@/components/ui/icons';
import { appStrings } from '@/lib/app/strings';
import { COURSE_SUGGESTIONS, SUBJECT_SUGGESTIONS } from '@/lib/app/suggestions';
import type { Curriculum, NoteContext } from '@/lib/ai/schema';
import type { DetectionState } from '@/lib/store/types';
import { cn } from '@/lib/utils/cn';

const CURRICULA: { value: Curriculum; label: string }[] = [
  { value: 'AP', label: 'AP' },
  { value: 'IB_HL', label: 'IB Higher Level' },
  { value: 'IB_SL', label: 'IB Standard Level' },
  { value: 'A_LEVEL', label: 'A-Level' },
  { value: 'IGCSE', label: 'IGCSE' },
  { value: 'INTERNAL', label: 'Internal / Honors' },
  { value: 'GENERAL', label: 'General' },
  { value: 'UNKNOWN', label: 'Not sure' },
];

const LANGUAGES: { value: string; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: '简体中文' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
];

export interface ContextEditorProps {
  context: NoteContext;
  /** The language the notes were written in; `context.language` is the language of the answer. */
  notesLanguage: string;
  detection: DetectionState;
  onChange: (patch: Partial<NoteContext>) => void;
  onNotesLanguageChange: (language: string) => void;
  packName: string | null;
  /** True once `listPacks()` has answered, so "no pack" is a fact rather than a loading state. */
  packsResolved: boolean;
  className?: string;
}

/**
 * The review screen's right pane (01-PRODUCT.md §2 step 3): what we think these notes are, with
 * every field editable.
 *
 * The one thing this component must never do is assert something it guessed. A wrong course
 * silently accepted produces a study guide aimed at the wrong exam, and the student has no way to
 * know why — so the header says where each answer came from, and a low-confidence detection reads
 * as a question rather than an answer.
 *
 * The pack badge is deliberately reassuring in the "no pack" case. Generic expert mode is a
 * supported path (05-CURRICULUM-PACKS.md §4), not a degraded one, and the copy says what it still
 * does rather than what it lacks.
 */
export function ContextEditor({
  context,
  notesLanguage,
  detection,
  onChange,
  onNotesLanguageChange,
  packName,
  packsResolved,
  className,
}: ContextEditorProps) {
  const unsure = detection.source === 'heuristic' && detection.confidence < 0.6;

  const courseOptions = useMemo(() => {
    const suggestions = COURSE_SUGGESTIONS.filter(
      (option) => context.curriculum === 'UNKNOWN' || option.curriculum === context.curriculum,
    ).map((option) => ({ value: option.name, label: option.name, detail: option.subject }));
    // What the student already typed always stays selectable, even if it is not a known course.
    if (context.course && !suggestions.some((option) => option.value === context.course)) {
      return [
        { value: context.course, label: context.course, detail: 'Your course' },
        ...suggestions,
      ];
    }
    return suggestions;
  }, [context.course, context.curriculum]);

  return (
    <div className={cn('flex flex-col gap-4 font-sans', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={detection.source === 'user' ? 'accent' : 'neutral'}>
          {detection.source === 'user'
            ? appStrings.context.setByYou
            : detection.source === 'model'
              ? appStrings.context.detectedByModel
              : appStrings.context.detected(detection.confidence)}
        </Badge>
        {packsResolved ? (
          packName ? (
            <Badge tone="accent" icon={<SparkIcon />}>
              {packName}
            </Badge>
          ) : (
            <Badge>Generic expert mode</Badge>
          )
        ) : null}
      </div>

      {unsure ? (
        <div className="rounded-md border border-warning/50 bg-verify p-3">
          <p className="text-sm font-medium text-text">{appStrings.review.detectingTitle}</p>
          <p className="mt-1 text-xs leading-snug text-text-muted">
            {appStrings.review.detectingBody}
          </p>
        </div>
      ) : null}

      <Field label={appStrings.context.subject} hint={appStrings.context.subjectHint}>
        <Combobox
          allowCustomValue
          options={SUBJECT_SUGGESTIONS.map((subject) => ({ value: subject, label: subject }))}
          value={context.subject || null}
          onValueChange={(subject) => onChange({ subject })}
          placeholder="Chemistry"
        />
      </Field>

      <Field label={appStrings.context.curriculum}>
        <Select
          value={context.curriculum}
          onValueChange={(value) => onChange({ curriculum: value as Curriculum })}
          placeholder="Pick one"
        >
          {CURRICULA.map((entry) => (
            <SelectItem key={entry.value} value={entry.value}>
              {entry.label}
            </SelectItem>
          ))}
        </Select>
      </Field>

      <Field label={appStrings.context.course} hint={appStrings.context.courseHint}>
        <Combobox
          allowCustomValue
          options={courseOptions}
          value={context.course || null}
          onValueChange={(course) => onChange({ course })}
          placeholder="AP Chemistry"
          emptyMessage="No match — press Enter to use what you typed."
        />
      </Field>

      <Field label={appStrings.context.unit} hint={appStrings.context.unitHint}>
        <Input
          value={context.unit ?? ''}
          onChange={(event) => onChange({ unit: event.target.value || null })}
          placeholder="Unit 1 — Atomic Structure"
        />
      </Field>

      <Field label={appStrings.context.language}>
        <Select value={notesLanguage} onValueChange={onNotesLanguageChange} placeholder="English">
          {LANGUAGES.map((entry) => (
            <SelectItem key={entry.value} value={entry.value}>
              {entry.label}
            </SelectItem>
          ))}
        </Select>
      </Field>

      {/*
        01-PRODUCT.md §7: notes in Chinese come back in Chinese, so following the source is the
        default. The toggle is the escape hatch for a student taking a subject in a second language
        who wants the explanation in their first — and it has nothing to say when the notes are
        already in English, so it is not shown.
      */}
      {notesLanguage !== 'en' ? (
        <Switch
          justified
          label={appStrings.context.keepLanguage}
          hint={appStrings.context.keepLanguageHint}
          checked={context.language === notesLanguage}
          onCheckedChange={(checked) => onChange({ language: checked ? notesLanguage : 'en' })}
        />
      ) : null}
    </div>
  );
}
