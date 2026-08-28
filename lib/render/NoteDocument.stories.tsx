import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { waitFor } from 'storybook/test';

import { TooltipProvider } from '@/components/ui/tooltip';

import { NoteDocument } from './NoteDocument';
import { goldFixture } from './fixture/gold';

/**
 * KaTeX, Mermaid and smiles-drawer all arrive by dynamic import, and layout — including whether a
 * given equation is wide enough to need a scroll region — is not final until they land. Without
 * this wait the accessibility check runs against a half-drawn note and reports problems that do
 * not exist in the rendered one.
 */
const waitForMath: NonNullable<Meta<typeof NoteDocument>['play']> = async ({ canvasElement }) => {
  await waitFor(() => {
    if (!canvasElement.querySelector('.katex')) throw new Error('KaTeX has not rendered yet');
  });
  await document.fonts.ready;
};

const meta: Meta<typeof NoteDocument> = {
  title: 'Notes/NoteDocument',
  component: NoteDocument,
  play: waitForMath,
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
type Story = StoryObj<typeof NoteDocument>;

/**
 * The whole gold fixture. Flip the theme in the toolbar: KaTeX, the Mermaid flowchart, the
 * smiles-drawer structure and the bar chart all recolour without a reload.
 */
export const GoldFixture: Story = {
  args: { doc: goldFixture() },
};

/** 375px: margin notes fold into `<details>`, the outline becomes a sheet, nothing scrolls sideways. */
export const Narrow: Story = {
  args: { doc: goldFixture() },
  parameters: { viewport: { value: 'mobile' } },
};

/** What the `/print` route renders — no outline rail, no reading toggle. */
export const PrintVariant: Story = {
  args: { doc: goldFixture(), forPrint: true },
};
