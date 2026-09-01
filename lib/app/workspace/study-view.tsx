'use client';

/**
 * Study (phase-08). The tab and its empty state, built now (phase-05 brief).
 *
 * It is a real empty state rather than a disabled tab, because the material is genuinely already
 * there: the pipeline writes flashcards, a quiz and a glossary into every document it produces, and
 * they have been sitting in `doc.studyTools` unused since phase-04. Saying so — with the counts —
 * is the difference between "not built yet" and "here is what is waiting", and 01 §6 asks empty
 * states to teach the next action.
 */
import { EmptyState } from '@/components/ui/empty-state';
import { GlossaryList } from '@/lib/render/glossary-list';
import { LightbulbIcon } from '@/components/ui/icons';
import { appStrings } from '@/lib/app/strings';
import type { NoteDocument } from '@/lib/ai/schema';

const strings = appStrings.workspace;

export function StudyView({ doc }: { doc: NoteDocument }) {
  const cards = doc.studyTools.flashcards.length;
  const questions = doc.studyTools.quiz.length;

  return (
    <div className="mx-auto flex w-full max-w-(--measure) flex-col gap-10">
      <EmptyState
        icon={<LightbulbIcon />}
        title={strings.studySoonTitle}
        description={strings.studySoonBody}
        action={
          cards + questions > 0 ? (
            <p className="font-sans text-sm text-text-muted">
              {strings.studyCounts(cards, questions)}
            </p>
          ) : null
        }
      />

      {/* The glossary is the one study tool that is finished: it is a list of terms the renderer
          already draws, with no scheduling, no flipping and no state. Withholding it until
          phase-08 would be tidiness at a student's expense. */}
      <GlossaryList entries={doc.glossary} />
    </div>
  );
}
