import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { waitFor } from 'storybook/test';

import { Case, Panel, Stack } from '../../.storybook/story-helpers';
import { goldFixture } from '@/lib/render/fixture/gold';

import { Flashcard } from './flashcard';
import { FlashcardDeck } from './flashcard-deck';
import { QuizRunner } from './quiz-runner';

/**
 * Flashcards and the quiz (03-DESIGN.md §5). Shells — phase-08 adds scheduling and scoring — but
 * the flip, the reveal and the keyboard path are real, and they use the study tools the gold
 * fixture actually contains rather than lorem.
 */
const meta: Meta = {
  title: 'Study/Tools',
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj;

const doc = goldFixture();

const waitForMath: NonNullable<Story['play']> = async ({ canvasElement }) => {
  await waitFor(() => {
    if (!canvasElement.querySelector('.katex')) throw new Error('KaTeX has not rendered yet');
  });
  await document.fonts.ready;
};

/** 3D flip at 260ms; instant when the viewer has asked for reduced motion. */
export const SingleCard: Story = {
  render: () => (
    <Panel width={420}>
      <Stack gap={24}>
        <Case label="click to flip">
          <Flashcard card={doc.studyTools.flashcards[0]!} />
        </Case>
      </Stack>
    </Panel>
  ),
};

// No `waitForMath` here: the first card in the deck is prose, so waiting for KaTeX would wait
// for something that never arrives.
export const Deck: Story = {
  render: () => (
    <Panel width={460}>
      <FlashcardDeck cards={doc.studyTools.flashcards} />
    </Panel>
  ),
};

/** Short-answer questions are self-marked on purpose — see the component for why. */
export const Quiz: Story = {
  play: waitForMath,
  render: () => (
    <Panel width={560}>
      <QuizRunner items={doc.studyTools.quiz} />
    </Panel>
  ),
};
