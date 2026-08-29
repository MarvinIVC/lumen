import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { waitFor } from 'storybook/test';

import { TooltipProvider } from '@/components/ui/tooltip';
import { Case, Stack } from '../../../.storybook/story-helpers';
import {
  bareFormula,
  brokenMermaid,
  correctedWorkedExample,
  sampleCallouts,
  sampleDefinition,
  sampleFormula,
  sampleMermaid,
  sampleMisconception,
  sampleStructure,
  sampleTable,
  sampleWorkedExample,
} from '../fixture/samples';

import { Callout } from './callout';
import { ChemStructure } from './chem-structure';
import { DiagramBlock } from './diagram-block';
import { FigureWithCaption } from './figure-with-caption';
import { Formula } from './formula';
import { KeyTerm } from './key-term';
import { List } from './list';
import { Misconception } from './misconception';
import { Paragraph } from './paragraph';
import { Table } from './table';
import { WorkedExample } from './worked-example';

/**
 * The content blocks of a note (03-DESIGN.md §6), each shown on its own. Everything sits inside
 * `.lumen-note` because these are typeset objects, not UI: they are designed against the serif
 * body and the note's leading, and they look wrong out of it.
 */
const meta: Meta = {
  title: 'Notes/Blocks',
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <TooltipProvider delayDuration={200}>
        <div className="lumen-note mx-auto max-w-(--measure)">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj;

/** Waits for the dynamic imports before the accessibility check measures anything. */
const waitForMath: NonNullable<Story['play']> = async ({ canvasElement }) => {
  await waitFor(() => {
    if (!canvasElement.querySelector('.katex')) throw new Error('KaTeX has not rendered yet');
  });
  await document.fonts.ready;
};

export const Prose: Story = {
  render: () => (
    <Stack gap={8}>
      <Paragraph
        block={{
          type: 'paragraph',
          text: 'A **titration** finds an unknown concentration by reacting it with a solution you do know, added a drop at a time until the reaction is exactly complete.',
          origin: 'student',
        }}
      />
      <List
        block={{
          type: 'list',
          ordered: false,
          items: [
            'Rinse the burette with the solution it will hold, not with water.',
            'Record the initial reading to $0.05\\ \\text{cm}^3$.',
            'Repeat until two titres agree within $0.10\\ \\text{cm}^3$.',
          ],
          origin: 'student',
        }}
      />
    </Stack>
  ),
};

export const KeyTermBlock: Story = {
  name: 'KeyTerm',
  play: waitForMath,
  render: () => <KeyTerm block={sampleDefinition} />,
};

/** Every formula is equation + variables with units + "use when" — no exceptions (rubric item 2). */
export const FormulaBlock: Story = {
  name: 'Formula',
  play: waitForMath,
  render: () => (
    <Stack gap={24}>
      <Case label="the full three-part shape">
        <Formula block={sampleFormula} />
      </Case>
      <Case label="a bare equation — the panel disappears rather than sitting empty">
        <Formula block={bareFormula} />
      </Case>
    </Stack>
  ),
};

export const WorkedExampleBlock: Story = {
  name: 'WorkedExample',
  play: waitForMath,
  render: () => (
    <Stack gap={32}>
      <Case label="a complete example">
        <WorkedExample block={sampleWorkedExample} />
      </Case>
      <Case label="finishing the student's own attempt — their line, struck, with the fix">
        <WorkedExample block={correctedWorkedExample} />
      </Case>
    </Stack>
  ),
};

/** Four kinds and no fifth. A note with a callout every other paragraph has taught you to skip them. */
export const Callouts: Story = {
  play: waitForMath,
  render: () => (
    <Stack gap={8}>
      {sampleCallouts.map((block) => (
        <Callout key={block.kind} block={block} />
      ))}
    </Stack>
  ),
};

export const MisconceptionBlock: Story = {
  name: 'Misconception',
  render: () => <Misconception block={sampleMisconception} />,
};

export const TableBlock: Story = {
  name: 'Table',
  render: () => <Table block={sampleTable} />,
};

export const Diagram: Story = {
  render: () => (
    <Stack gap={24}>
      <Case label="a themed Mermaid flowchart">
        <DiagramBlock block={sampleMermaid} figureNumber={1} />
      </Case>
      <Case label="an unsupported diagram type — dropped, caption kept, never an error box">
        <DiagramBlock block={brokenMermaid} figureNumber={2} />
      </Case>
    </Stack>
  ),
};

export const Structure: Story = {
  render: () => <ChemStructure block={sampleStructure} figureNumber={1} />,
};

/**
 * The shell every captioned visual shares. Numbering belongs to the renderer, not to the model —
 * letting a caption say "Figure 1.2" is how a document ends up with two Figure 3s after an edit.
 */
export const Figure: Story = {
  render: () => (
    <Stack gap={24}>
      <Case label="a numbered figure">
        <FigureWithCaption number={4} caption="A caption sits under the thing it describes.">
          <div className="grid h-32 w-full place-items-center rounded-note bg-bg-sunken font-sans text-sm text-text-muted">
            any visual
          </div>
        </FigureWithCaption>
      </Case>
      <Case label="illustrative data says so, in the caption">
        <FigureWithCaption
          number={5}
          illustrative
          caption="A model spectrum, drawn to show the shape rather than to be read off."
        >
          <div className="grid h-32 w-full place-items-center rounded-note bg-bg-sunken font-sans text-sm text-text-muted">
            any visual
          </div>
        </FigureWithCaption>
      </Case>
    </Stack>
  ),
};
