/**
 * "My original" — reconstructing the student's own note from a rebuilt one (03-DESIGN.md §6).
 *
 * This is a trust surface before it is a feature. The mode exists so a student can prove to
 * themselves that we did not quietly replace their work, and a version of it that loses some of
 * their work while claiming to show all of it is worse than not shipping it.
 *
 * Which is what phase-04 found in the deployed output, and it is the reason this module exists
 * rather than the one-line filter the renderer had: **a corrected block's original wording lives
 * only in its `originalText`.** There is no `student` block holding it. The old rule — render
 * blocks whose origin is `student`, drop the rest — therefore deleted the student's mercury
 * calculation from their own view of their own notes, silently, in the one mode whose entire job
 * is to be complete.
 *
 * So the rule is by origin, not by a single predicate:
 *
 *   student       kept as it is
 *   ai-added      dropped — it is ours, and the mode is theirs
 *   ai-clarified  restored to `originalText`: their phrasing, before we tightened it
 *   ai-corrected  restored to `originalText`: their working, before we fixed it
 *
 * Everything around the sections goes too. The summary, the objectives, the corrections list, the
 * glossary and the study tools are all things we wrote; leaving them on the page under a heading
 * that says "only the parts you wrote yourself" would be the same lie in a different place.
 */
import type { Block, NoteDocument, ParagraphBlock } from '@/lib/ai/schema';

/**
 * The document as the student wrote it, as far as we can reconstruct it.
 *
 * A pure function of the document rather than renderer state, which is what lets the printed
 * output, an export and a test all ask the same question and get the same answer.
 */
export function toMyOriginal(doc: NoteDocument): NoteDocument {
  // Phase-04 measured a student sentence claimed by *two* blocks — an `ai-clarified` and an
  // `ai-corrected` carrying the same `originalText`, because we both tightened their phrasing and
  // fixed their arithmetic in one pass. Restoring both would show them their own sentence twice
  // and read as a rendering bug. First claim wins; the second block simply goes.
  const restored = new Set<string>();

  const sections = doc.sections
    .map((section) => ({
      ...section,
      blocks: section.blocks.flatMap((block) => originalOf(block, restored)),
    }))
    .filter((section) => section.blocks.length > 0);

  return {
    ...doc,
    summary: '',
    objectives: [],
    sections,
    corrections: [],
    openQuestions: [],
    glossary: [],
    furtherStudy: [],
    factCheck: { ...doc.factCheck, flags: [] },
    studyTools: { flashcards: [], quiz: [] },
  };
}

function originalOf(block: Block, restored: Set<string>): Block[] {
  if (block.origin === 'student') return [block];
  if (block.origin === 'ai-added') return [];

  const original = block.originalText?.trim();
  if (!original) return [];
  if (restored.has(original)) return [];
  restored.add(original);

  return [asStudentParagraph(block, original)];
}

/**
 * Their words, as a paragraph.
 *
 * A corrected formula or worked example cannot go back to being one: `originalText` is prose —
 * "n = 0.5 x 200.6 = 100.3 g" as they wrote it — and forcing it back into a `latex` field would
 * hand KaTeX something that is not LaTeX and print a raw-source error chip where their working
 * should be. A paragraph is the shape their line actually had.
 */
function asStudentParagraph(block: Block, text: string): ParagraphBlock {
  return {
    type: 'paragraph',
    text,
    origin: 'student',
    ...(block.id ? { id: block.id } : {}),
  };
}

/**
 * True when the mode has something to show — used to keep the toggle honest.
 *
 * A note generated from a photo of a whiteboard can be almost entirely `ai-added`, and offering
 * "My original" on it leads to a blank page. The toggle stays, disabled, saying why.
 */
export function hasOriginalContent(doc: NoteDocument): boolean {
  return doc.sections.some((section) =>
    section.blocks.some(
      (block) => block.origin === 'student' || Boolean(block.originalText?.trim()),
    ),
  );
}
