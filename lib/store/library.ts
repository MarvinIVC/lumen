import type { Flashcard, NoteDocument } from '@/lib/ai/schema';

import { getDb } from './db';
import { deleteNote, listNotes, loadNote, saveNote } from './drafts';
import { queueMutation } from './outbox';
import type { LocalCourse, LocalNote, LocalUnit } from './types';

const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
/** The comparison key for every "is this the same thing" question in the library: course names on
 * the first merge, and card text when a unit is combined into one deck. Interior whitespace is
 * collapsed as well as trimmed — two lessons in the same unit produce the same card with a
 * different line break, and a key that keeps the break keeps the duplicate. */
const normal = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();

export interface LibrarySnapshot {
  courses: LocalCourse[];
  units: LocalUnit[];
  notes: LocalNote[];
}

export async function loadLibrary(): Promise<LibrarySnapshot> {
  const db = await getDb();
  if (!db) return { courses: [], units: [], notes: [] };
  const [courses, units, notes] = await Promise.all([
    db.getAllFromIndex('courses', 'by-ordinal'),
    db.getAll('units'),
    listNotes(10_000),
  ]);
  return {
    courses,
    units: units.sort((a, b) => a.ordinal - b.ordinal || a.name.localeCompare(b.name)),
    notes,
  };
}

export async function saveCourse(course: LocalCourse, queue = true): Promise<void> {
  const db = await getDb();
  await db?.put('courses', { ...course, updatedAt: Date.now() });
  if (queue) await queueMutation('course', course.id);
}

export async function saveUnit(unit: LocalUnit, queue = true): Promise<void> {
  const db = await getDb();
  await db?.put('units', { ...unit, updatedAt: Date.now() });
  if (queue) await queueMutation('unit', unit.id);
}

export async function createCourse(
  input: Pick<LocalCourse, 'subject' | 'curriculum' | 'name'> &
    Partial<Pick<LocalCourse, 'packId' | 'color'>>,
): Promise<LocalCourse> {
  const courses = (await loadLibrary()).courses;
  const now = Date.now();
  const course: LocalCourse = {
    id: id('crs'),
    subject: input.subject,
    curriculum: input.curriculum,
    name: input.name,
    packId: input.packId ?? null,
    color: input.color ?? null,
    ordinal: courses.length,
    createdAt: now,
    updatedAt: now,
  };
  await saveCourse(course);
  return course;
}

export async function createUnit(courseId: string, name: string): Promise<LocalUnit> {
  const units = (await loadLibrary()).units.filter((unit) => unit.courseId === courseId);
  const now = Date.now();
  const unit: LocalUnit = {
    id: id('unt'),
    courseId,
    name,
    ordinal: units.length,
    createdAt: now,
    updatedAt: now,
  };
  await saveUnit(unit);
  return unit;
}

/** Creates the course/unit a signed-out note already describes. Re-running is idempotent. */
export async function placeNoteFromContext(note: LocalNote): Promise<LocalNote> {
  if (note.courseId && note.unitId) return note;
  const library = await loadLibrary();
  const courseName = note.context.course.trim() || `${note.context.subject || 'General'} notes`;
  let course = library.courses.find(
    (row) =>
      normal(row.name) === normal(courseName) &&
      normal(row.subject) === normal(note.context.subject) &&
      normal(row.curriculum) === normal(note.context.curriculum),
  );
  course ??= await createCourse({
    subject: note.context.subject || 'General',
    curriculum: note.context.curriculum === 'UNKNOWN' ? 'GENERAL' : note.context.curriculum,
    name: courseName,
    packId: note.context.packId ?? null,
  });

  const unitName = note.context.unit?.trim() || note.context.topic?.trim() || 'Unsorted';
  let unit = library.units.find(
    (row) => row.courseId === course.id && normal(row.name) === normal(unitName),
  );
  unit ??= await createUnit(course.id, unitName);

  const placed = { ...note, courseId: course.id, unitId: unit.id };
  await saveNote(placed);
  return placed;
}

/**
 * Sequential on purpose.
 *
 * `placeNoteFromContext` reads the library, then creates what it did not find. Run in parallel,
 * every note reads the same empty library and creates its own copy of the same course: a student
 * arriving at the library with six signed-out lessons from one course got six identical courses,
 * and then synced all six. The list is one browser's notes, so the cost of doing this in order is
 * nothing.
 */
export async function placeAllNotes(): Promise<LocalNote[]> {
  const notes = await listNotes(10_000);
  const placed: LocalNote[] = [];
  for (const note of notes) placed.push(await placeNoteFromContext(note));
  return placed;
}

export async function moveNote(noteId: string, unitId: string | null): Promise<void> {
  const note = await loadNote(noteId);
  if (!note) return;
  const db = await getDb();
  const unit = unitId ? await db?.get('units', unitId) : null;
  await saveNote({
    ...note,
    unitId,
    courseId: unit?.courseId ?? note.courseId ?? null,
  });
}

export async function renameCourse(courseId: string, name: string): Promise<void> {
  const db = await getDb();
  const course = await db?.get('courses', courseId);
  if (course) await saveCourse({ ...course, name: name.trim() || course.name });
}

export async function colorCourse(courseId: string, color: string | null): Promise<void> {
  const db = await getDb();
  const course = await db?.get('courses', courseId);
  if (course) await saveCourse({ ...course, color });
}

export async function renameUnit(unitId: string, name: string): Promise<void> {
  const db = await getDb();
  const unit = await db?.get('units', unitId);
  if (unit) await saveUnit({ ...unit, name: name.trim() || unit.name });
}

export async function reorderCourses(ids: string[]): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const courses = await db.getAll('courses');
  await Promise.all(
    courses.map((course) => {
      const ordinal = ids.indexOf(course.id);
      return ordinal < 0 ? Promise.resolve() : saveCourse({ ...course, ordinal });
    }),
  );
}

export async function reorderUnits(courseId: string, ids: string[]): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const units = await db.getAllFromIndex('units', 'by-course', courseId);
  await Promise.all(
    units.map((unit) => {
      const ordinal = ids.indexOf(unit.id);
      return ordinal < 0 ? Promise.resolve() : saveUnit({ ...unit, ordinal });
    }),
  );
}

export async function removeNotes(ids: string[]): Promise<void> {
  await Promise.all(ids.map(deleteNote));
}

export function flattenDocument(document: NoteDocument | undefined): string {
  if (!document) return '';
  const values: string[] = [
    document.title,
    document.summary,
    ...document.objectives,
    ...document.sections.flatMap((section) => [
      section.title,
      ...section.blocks.flatMap((block) => blockText(block)),
    ]),
    ...document.glossary.flatMap((entry) => [entry.term, entry.definition]),
    ...document.openQuestions.flatMap((entry) => [entry.question, entry.why]),
  ];
  return values.filter(Boolean).join('\n');
}

function blockText(value: unknown, key = ''): string[] {
  if (typeof value === 'string') {
    return ['id', 'type', 'origin', 'kind', 'anchorId', 'assetId'].includes(key) ? [] : [value];
  }
  if (Array.isArray(value)) return value.flatMap((item) => blockText(item, key));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([childKey, child]) => blockText(child, childKey));
}

export function searchLocalNotes(notes: LocalNote[], query: string): LocalNote[] {
  const terms = normal(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return notes;
  return notes.filter((note) => {
    const haystack = normal(
      [note.title, note.context.course, note.context.unit, flattenDocument(note.generated)].join(
        '\n',
      ),
    );
    return terms.every((term) => haystack.includes(term));
  });
}

export function combineFlashcards(notes: LocalNote[]): Flashcard[] {
  const seen = new Set<string>();
  const cards: Flashcard[] = [];
  for (const note of notes) {
    for (const card of note.generated?.studyTools.flashcards ?? []) {
      const key = normal(`${card.front}\n${card.back}`);
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push(card);
    }
  }
  return cards;
}
