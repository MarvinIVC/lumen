import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { TooltipProvider } from '@/components/ui/tooltip';
import { Case, Stack } from '../../.storybook/story-helpers';

import { CorrectionsPanel } from './corrections-panel';
import { GlossaryList } from './glossary-list';
import { MarginNote } from './margin-note';
import { OpenQuestionsPanel } from './open-questions-panel';
import { OutlineRail } from './outline-rail';
import { ProvenanceBlock, ProvenanceSpan } from './provenance-mark';
import { ReadingModeProvider } from './reading-mode';
import { ReadingModeToggle } from './reading-mode-toggle';
import { VerifyBadge } from './verify-badge';
import { buildOutline } from './outline-rail';
import { goldFixture } from './fixture/gold';
import {
  sampleCorrections,
  sampleFlags,
  sampleGlossary,
  sampleMarginNotes,
  sampleOpenQuestions,
} from './fixture/samples';

/**
 * The parts of a note that are *about* the note: what changed, what to check, what the words mean.
 * Together they are the trust story (06 §5) — the reason a student can believe the rest of it.
 */
const meta: Meta = {
  title: 'Notes/Panels',
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <TooltipProvider delayDuration={200}>
        <ReadingModeProvider>
          <div className="lumen-note mx-auto max-w-(--measure)">
            <Story />
          </div>
        </ReadingModeProvider>
      </TooltipProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj;

/** Framed as "here's what to relearn", never as a scold. The count animates up once. */
export const Corrections: Story = {
  render: () => <CorrectionsPanel corrections={sampleCorrections} />,
};

export const OpenQuestions: Story = {
  render: () => <OpenQuestionsPanel questions={sampleOpenQuestions} />,
};

/** Appears on any section the model flagged as uncertain. Names the claim, not "AI can be wrong". */
export const VerifyBadges: Story = {
  render: () => (
    <Stack gap={24}>
      <Case label="collapsed">
        <VerifyBadge flags={sampleFlags.slice(0, 1)} />
      </Case>
      <Case label="several claims">
        <VerifyBadge flags={sampleFlags} />
      </Case>
    </Stack>
  ),
};

export const Glossary: Story = {
  render: () => <GlossaryList entries={sampleGlossary} />,
};

/**
 * Tufte sidenotes. Above 1100px they sit in the margin column; below it they fold into
 * `<details>` — resize the preview to watch them change.
 */
export const MarginNotes: Story = {
  render: () => (
    <Stack gap={4}>
      {sampleMarginNotes.map((note) => (
        <MarginNote key={note.kind} block={note} />
      ))}
    </Stack>
  ),
};

/** The three provenance surfaces, side by side, at their calm default intensity. */
export const Provenance: Story = {
  render: () => (
    <Stack gap={16}>
      <ProvenanceBlock origin="student">
        <p className="leading-note">
          Nothing marks the student&rsquo;s own writing. It is the baseline, not a category.
        </p>
      </ProvenanceBlock>
      <ProvenanceBlock origin="ai-added">
        <p className="leading-note">
          An added block gets an accent rule and a 5% tint. The &ldquo;added&rdquo; chip appears on
          hover or focus — and always, once Highlight AI is on.
        </p>
      </ProvenanceBlock>
      <ProvenanceBlock origin="ai-clarified">
        <p className="leading-note">
          A clarified block, where the meaning was yours and the wording was sharpened.
        </p>
      </ProvenanceBlock>
      <ProvenanceBlock origin="ai-corrected">
        <p className="leading-note">
          A correction stays visible in every reading mode. This is a learning surface, not noise to
          hide.
        </p>
      </ProvenanceBlock>
      <p className="leading-note">
        Inline, a clarified phrase keeps a dotted underline and your own wording one hover away:{' '}
        <ProvenanceSpan
          origin="ai-clarified"
          originalText="relative abundance = how many of that isotope"
        >
          relative (fractional) abundance
        </ProvenanceSpan>
        .
      </p>
    </Stack>
  ),
};

export const ReadingMode: Story = {
  render: function ReadingMode() {
    return <ReadingModeToggle />;
  },
};

/**
 * Generated from the document, not scraped from the DOM, so server and client agree. The dot means
 * the section contains an addition or something worth checking.
 */
export const Outline: Story = {
  parameters: { layout: 'centered' },
  render: function Outline() {
    const [entries] = useState(() => buildOutline(goldFixture()));
    return (
      <div className="w-56">
        <OutlineRail entries={entries} />
      </div>
    );
  },
};
