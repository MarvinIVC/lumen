/**
 * Document edits that are not accept/reject (phase-05 §10, §11, §12).
 *
 * Inserting a block, replacing a regenerated section, dropping something — every one of them is a
 * pure `NoteDocument → NoteDocument`. The editor calls them, the regenerate diff calls them, "ask
 * about this" calls them, and none of them touches React or the store, which is what makes the
 * interesting behaviour testable without a browser.
 *
 * The recurring obligation is bookkeeping. A block that appears needs an id; a section that is
 * replaced takes its corrections, open questions, glossary entries and fact-check flags with it,
 * or the panels end up describing text that is no longer in the document. Doing that by hand at
 * each call site is how a panel starts lying, so it is done here, once.
 */
import { computeStats } from '@/lib/ai/validate';
import type { Block, NoteDocument, Section } from '@/lib/ai/schema';

import { ensureBlockIds } from './identity';

/** Insert after `afterBlockId`, or at the end of the section when it is null. */
export function insertBlock(
  doc: NoteDocument,
  sectionId: string,
  block: Block,
  afterBlockId: string | null = null,
): NoteDocument {
  const next = {
    ...doc,
    sections: doc.sections.map((section) => {
      if (section.id !== sectionId) return section;
      const at = afterBlockId
        ? section.blocks.findIndex((candidate) => candidate.id === afterBlockId) + 1
        : section.blocks.length;
      const blocks = [...section.blocks];
      blocks.splice(at > 0 ? at : section.blocks.length, 0, block);
      return { ...section, blocks };
    }),
  };
  return restat(ensureBlockIds(next));
}

/**
 * Swaps one section for a regenerated one (§10).
 *
 * The section's own annotations are replaced rather than merged. A regenerate returns a new
 * treatment of the same syllabus point: the correction that said "you wrote 100.3 g, it is 100.30 g"
 * belongs to text that no longer exists, and keeping it alongside the new blocks leaves the panel
 * pointing at a sentence the student cannot find. Annotations for *other* sections are untouched.
 *
 * The replacement keeps the original section's id, level and position, whatever the model called
 * them. The outline, the flashcards, the quiz and every `sectionId` in the document are keyed on
 * that id, and letting a regeneration rename it would strand all of them at once.
 */
export function replaceSection(
  doc: NoteDocument,
  sectionId: string,
  incoming: Section,
  annotations: SectionAnnotations = {},
): NoteDocument {
  const original = doc.sections.find((section) => section.id === sectionId);
  if (!original) return doc;

  const replacement: Section = {
    ...incoming,
    id: original.id,
    level: original.level,
    title: incoming.title.trim() || original.title,
    // Ids from the fragment cannot be trusted to be unique against the rest of the document.
    blocks: incoming.blocks.map((block) => {
      const next = { ...block };
      delete next.id;
      return next;
    }),
  };

  const next: NoteDocument = {
    ...doc,
    sections: doc.sections.map((section) => (section.id === sectionId ? replacement : section)),
    corrections: [
      ...doc.corrections.filter((entry) => entry.sectionId !== sectionId),
      ...(annotations.corrections ?? []).map((entry) => ({ ...entry, sectionId })),
    ],
    openQuestions: [
      ...doc.openQuestions.filter((entry) => entry.sectionId !== sectionId),
      ...(annotations.openQuestions ?? []).map((entry) => ({ ...entry, sectionId })),
    ],
    glossary: [
      ...doc.glossary.filter((entry) => entry.sectionId !== sectionId),
      ...(annotations.glossary ?? []).map((entry) => ({ ...entry, sectionId })),
    ],
    factCheck: {
      ...doc.factCheck,
      // A flag is a "double-check this" about a claim that has just been rewritten. It goes with
      // the text, and a new one comes back with the fragment if the claim survived.
      flags: doc.factCheck.flags.filter((flag) => flag.sectionId !== sectionId),
    },
  };

  return restat(ensureBlockIds(next));
}

export interface SectionAnnotations {
  corrections?: NoteDocument['corrections'];
  openQuestions?: NoteDocument['openQuestions'];
  glossary?: NoteDocument['glossary'];
}

function restat(doc: NoteDocument): NoteDocument {
  return { ...doc, stats: computeStats(doc) };
}
