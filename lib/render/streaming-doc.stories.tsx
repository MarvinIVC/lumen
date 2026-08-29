import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { StreamingDoc } from '@/components/domain/streaming-doc';
import { TooltipProvider } from '@/components/ui/tooltip';

import { goldFixture } from './fixture/gold';

/**
 * The note arriving (03-DESIGN.md §7). A hairline under the top bar, a narration line that
 * cross-fades, section skeletons for what is still coming, and one calm "settle" at the end.
 *
 * Turn on reduced motion in your OS and reload: the reveal and the pulse both disappear, and the
 * status line changes without a fade. That is what §7 means by no motion rather than less.
 */
const meta: Meta<typeof StreamingDoc> = {
  title: 'Notes/StreamingDoc',
  component: StreamingDoc,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <TooltipProvider delayDuration={200}>
        <Story />
      </TooltipProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof StreamingDoc>;

const full = goldFixture();

const NARRATION = [
  'Reading your notes…',
  'Working out what course this is…',
  'Rebuilding 1.1 — the mole and molar mass…',
  'Checking the mercury calculation…',
  'Finishing the C₅H₇N example your notes stopped in the middle of…',
  'Collecting the glossary…',
];

/** Frozen part-way, so the skeletons and the narration line can be looked at properly. */
export const Arriving: Story = {
  args: {
    doc: { ...full, sections: full.sections.slice(0, 3) },
    expectedSections: full.sections.length,
    status: NARRATION[3],
  },
};

export const Finished: Story = {
  args: { doc: full, expectedSections: full.sections.length, done: true },
};

/** The whole sequence, on a loop. */
export const Live: Story = {
  render: function Live() {
    const [step, setStep] = useState(0);

    useEffect(() => {
      const timer = window.setInterval(() => {
        setStep((value) => (value + 1) % (full.sections.length + 2));
      }, 1400);
      return () => window.clearInterval(timer);
    }, []);

    const done = step >= full.sections.length;

    return (
      <StreamingDoc
        doc={{ ...full, sections: full.sections.slice(0, Math.min(step, full.sections.length)) }}
        expectedSections={full.sections.length}
        status={NARRATION[Math.min(step, NARRATION.length - 1)]}
        done={done}
      />
    );
  },
};
