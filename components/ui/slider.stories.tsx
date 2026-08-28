import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Case, Panel, Stack } from '../../.storybook/story-helpers';

import { Field } from './field';
import { Slider } from './slider';

const meta: Meta<typeof Slider> = {
  title: 'Primitives/Slider',
  component: Slider,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof Slider>;

export const Default: Story = {
  render: () => (
    <Panel>
      <Field label="Daily budget" hint="How many study guides you can make each day.">
        <Slider defaultValue={[3]} min={1} max={10} step={1} thumbLabels={['Daily budget']} />
      </Field>
    </Panel>
  ),
};

export const States: Story = {
  render: () => (
    <Panel>
      <Stack gap={24}>
        <Case label="range — two thumbs, each separately named">
          <Slider defaultValue={[20, 80]} min={0} max={100} thumbLabels={['Minimum', 'Maximum']} />
        </Case>
        <Case label="stepped">
          <Slider defaultValue={[2]} min={0} max={4} step={1} thumbLabels={['Depth']} />
        </Case>
        <Case label="disabled">
          <Slider defaultValue={[50]} disabled thumbLabels={['Unavailable']} />
        </Case>
      </Stack>
    </Panel>
  ),
};
