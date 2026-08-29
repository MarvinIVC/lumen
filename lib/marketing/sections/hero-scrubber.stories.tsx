import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { GoldPage } from './gold-page';
import { HeroScrubber } from './hero-scrubber';
import { RawPage } from './raw-page';

/**
 * The landing page's before/after comparison (03-DESIGN.md §8.1).
 *
 * Storied specifically so axe sees it. Lighthouse audits the marketing routes, but a slider whose
 * whole appearance is borrowed from a hidden native thumb is exactly the kind of control that
 * passes a page audit and still announces nothing useful — the accessible name, the spoken value
 * and the focus ring are the parts worth checking in isolation.
 *
 * The two documents are real: the same server components the page renders, with the same fixture
 * text behind them.
 */
const meta: Meta<typeof HeroScrubber> = {
  title: 'Marketing/HeroScrubber',
  component: HeroScrubber,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof HeroScrubber>;

const LABELS = {
  label: 'Wipe between the original notes and the finished study guide',
  valueTemplate: '{percent}% finished study guide, {rest}% original notes',
  beforeLabel: (
    <p className="inline-flex w-fit rounded-sm bg-bg-sunken px-2 py-1 font-mono text-xs tracking-widest text-text-muted uppercase">
      What you took
    </p>
  ),
  afterLabel: (
    <p className="inline-flex w-fit rounded-sm bg-accent-weak px-2 py-1 font-mono text-xs tracking-widest text-text uppercase">
      What you get
    </p>
  ),
};

export const Default: Story = {
  render: () => (
    <div className="rounded-note border border-border bg-bg-sunken">
      <HeroScrubber
        {...LABELS}
        before={<RawPage label="What you took" caption="AP Chem Notes.docx" />}
        after={
          <GoldPage
            label="What you get"
            caption="Atomic Structure & Properties — The Mole, Isotopes, and Formulas"
            correctedLabel="corrected"
          />
        }
      />
    </div>
  ),
};

/**
 * The messy page on its own. Worth a story of its own because it is the one place on the site that
 * renders a student's unedited text, and the ruled background has to sit *between* the lines —
 * misaligned by a few pixels it reads as a strikethrough through their words.
 */
export const RawNotesOnly: StoryObj = {
  render: () => (
    <div className="max-w-lg">
      <RawPage label="What you took" caption="AP Chem Notes.docx" />
    </div>
  ),
};

/** The typeset panel on its own — the hero's claim about what "beautiful" means. */
export const FinishedOnly: StoryObj = {
  render: () => (
    <div className="max-w-lg">
      <GoldPage
        label="What you get"
        caption="Atomic Structure & Properties — The Mole, Isotopes, and Formulas"
        correctedLabel="corrected"
      />
    </div>
  ),
};
