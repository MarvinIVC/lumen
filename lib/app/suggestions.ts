/**
 * The bundled suggestion lists behind the subject and course comboboxes (01-PRODUCT.md §2 step 3).
 *
 * Suggestions, not a taxonomy. Both fields accept anything typed — an international school's
 * "Honors Chemistry 2" is a real course and has to be nameable — and this list exists so the
 * common cases are one keystroke away and spelled consistently, which is what lets a pack match
 * later. It is not a validation set and nothing rejects a value that is missing from it.
 *
 * Kept deliberately small. The full course space is the job of the curriculum packs
 * (05-CURRICULUM-PACKS.md); duplicating it here would guarantee the two drift.
 */
import type { Curriculum } from '@/lib/ai/schema';

/** Matches the keys of `SUBJECT_KEYWORDS` in `lib/curriculum/detect.ts`, plus the ones we cannot detect. */
export const SUBJECT_SUGGESTIONS = [
  'Biology',
  'Business',
  'Chemistry',
  'Computer Science',
  'Economics',
  'English Literature',
  'Environmental Science',
  'Geography',
  'History',
  'Mathematics',
  'Music',
  'Physics',
  'Psychology',
] as const;

export interface CourseSuggestion {
  name: string;
  subject: string;
  curriculum: Curriculum;
}

export const COURSE_SUGGESTIONS: CourseSuggestion[] = [
  { name: 'AP Biology', subject: 'Biology', curriculum: 'AP' },
  { name: 'AP Chemistry', subject: 'Chemistry', curriculum: 'AP' },
  { name: 'AP Computer Science A', subject: 'Computer Science', curriculum: 'AP' },
  { name: 'AP Environmental Science', subject: 'Environmental Science', curriculum: 'AP' },
  { name: 'AP Macroeconomics', subject: 'Economics', curriculum: 'AP' },
  { name: 'AP Microeconomics', subject: 'Economics', curriculum: 'AP' },
  { name: 'AP Physics 1', subject: 'Physics', curriculum: 'AP' },
  { name: 'AP Physics C: Mechanics', subject: 'Physics', curriculum: 'AP' },
  { name: 'AP Psychology', subject: 'Psychology', curriculum: 'AP' },
  { name: 'AP Calculus AB', subject: 'Mathematics', curriculum: 'AP' },
  { name: 'AP Calculus BC', subject: 'Mathematics', curriculum: 'AP' },
  { name: 'AP World History: Modern', subject: 'History', curriculum: 'AP' },
  {
    name: 'AP English Literature and Composition',
    subject: 'English Literature',
    curriculum: 'AP',
  },

  { name: 'IB Biology HL', subject: 'Biology', curriculum: 'IB_HL' },
  { name: 'IB Chemistry HL', subject: 'Chemistry', curriculum: 'IB_HL' },
  { name: 'IB Physics HL', subject: 'Physics', curriculum: 'IB_HL' },
  {
    name: 'IB Mathematics: Analysis and Approaches HL',
    subject: 'Mathematics',
    curriculum: 'IB_HL',
  },
  { name: 'IB History HL', subject: 'History', curriculum: 'IB_HL' },
  { name: 'IB Economics HL', subject: 'Economics', curriculum: 'IB_HL' },

  { name: 'IB Biology SL', subject: 'Biology', curriculum: 'IB_SL' },
  { name: 'IB Chemistry SL', subject: 'Chemistry', curriculum: 'IB_SL' },
  { name: 'IB Physics SL', subject: 'Physics', curriculum: 'IB_SL' },
  {
    name: 'IB Mathematics: Applications and Interpretation SL',
    subject: 'Mathematics',
    curriculum: 'IB_SL',
  },
  { name: 'IB Economics SL', subject: 'Economics', curriculum: 'IB_SL' },

  { name: 'A-Level Biology', subject: 'Biology', curriculum: 'A_LEVEL' },
  { name: 'A-Level Chemistry', subject: 'Chemistry', curriculum: 'A_LEVEL' },
  { name: 'A-Level Physics', subject: 'Physics', curriculum: 'A_LEVEL' },
  { name: 'A-Level Mathematics', subject: 'Mathematics', curriculum: 'A_LEVEL' },
  { name: 'A-Level Economics', subject: 'Economics', curriculum: 'A_LEVEL' },

  { name: 'IGCSE Biology', subject: 'Biology', curriculum: 'IGCSE' },
  { name: 'IGCSE Chemistry', subject: 'Chemistry', curriculum: 'IGCSE' },
  { name: 'IGCSE Physics', subject: 'Physics', curriculum: 'IGCSE' },
  { name: 'IGCSE Mathematics', subject: 'Mathematics', curriculum: 'IGCSE' },
];
