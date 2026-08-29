import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Case, Stack } from '../../../.storybook/story-helpers';
import type { ChartSpec } from '@/lib/ai/schema';

import { DataChart } from './data-chart';

/**
 * The four chart shapes the model may emit (06 §1), hand-rolled in SVG so they are small, themed
 * from the same tokens as everything else, and vector in the printed PDF.
 *
 * One accent and neutrals; direct labels rather than a legend; no gridline clutter; axis titles
 * always. Flip the theme in the toolbar — these need no re-render at all, because unlike Mermaid
 * they reference the CSS variables directly.
 */
const meta: Meta<typeof DataChart> = {
  title: 'Notes/DataChart',
  component: DataChart,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof DataChart>;

const bars: ChartSpec = {
  kind: 'bars',
  x: 'ionisation',
  y: 'energy (kJ·mol⁻¹)',
  series: [
    { label: '1st', value: 738 },
    { label: '2nd', value: 1451 },
    { label: '3rd', value: 7733 },
    { label: '4th', value: 10540 },
  ],
  note: 'The jump between the 2nd and 3rd tells you magnesium has two outer electrons.',
  illustrative: false,
};

const line: ChartSpec = {
  kind: 'line',
  x: 'volume of NaOH added (cm³)',
  y: 'pH',
  points: [
    { x: 0, y: 1.0 },
    { x: 5, y: 1.2 },
    { x: 10, y: 1.5 },
    { x: 20, y: 2.2 },
    { x: 24, y: 3.5 },
    { x: 25, y: 7.0 },
    { x: 26, y: 10.5 },
    { x: 30, y: 11.8 },
    { x: 40, y: 12.4 },
  ],
  annotations: [{ x: 25, label: 'equivalence' }],
  illustrative: true,
};

const steps: ChartSpec = {
  kind: 'steps',
  x: 'binding energy (MJ·mol⁻¹)',
  y: 'relative electrons',
  points: [
    { x: 0.6, y: 2 },
    { x: 1.36, y: 2 },
    { x: 6.84, y: 2 },
    { x: 104, y: 2 },
  ],
  illustrative: true,
};

const composition: ChartSpec = {
  kind: 'composition',
  parts: [
    { label: 'Nitrogen', fraction: 0.78 },
    { label: 'Oxygen', fraction: 0.21 },
    { label: 'Argon', fraction: 0.0093 },
    { label: 'Everything else', fraction: 0.0007 },
  ],
  illustrative: false,
};

export const Bars: Story = {
  args: {
    spec: bars,
    alt: 'Successive ionisation energies of magnesium, rising sharply after the second.',
  },
};

export const Line: Story = {
  args: {
    spec: line,
    alt: 'Titration curve: pH rises slowly, then vertically through the equivalence point at 25 cm³, then levels off.',
  },
};

export const Steps: Story = {
  args: {
    spec: steps,
    alt: 'Photoelectron spectrum with four peaks at increasing binding energy, each holding two electrons.',
  },
};

/** Ordered largest first and shaded down one accent ramp — a magnitude, not four unrelated kinds. */
export const Composition: Story = {
  args: {
    spec: composition,
    alt: 'Composition of dry air by volume: 78% nitrogen, 21% oxygen, 0.9% argon.',
  },
};

export const AllFour: Story = {
  render: () => (
    <Stack gap={40}>
      <Case label="bars">
        <DataChart spec={bars} alt="Successive ionisation energies of magnesium." />
      </Case>
      <Case label="line">
        <DataChart spec={line} alt="A strong acid titrated with a strong base." />
      </Case>
      <Case label="steps">
        <DataChart spec={steps} alt="A photoelectron spectrum drawn as a step function." />
      </Case>
      <Case label="composition">
        <DataChart spec={composition} alt="Composition of dry air by volume." />
      </Case>
    </Stack>
  ),
};
