import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Case, Panel, Stack } from '../../.storybook/story-helpers';

import { SegmentedControl } from './segmented-control';

/**
 * Looks like a tab list, is not one. See the component for why that distinction has teeth — in
 * short, a tab owns a panel and announces `aria-controls`, and these options do not.
 */
const meta: Meta<typeof SegmentedControl> = {
  title: 'Primitives/SegmentedControl',
  component: SegmentedControl,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof SegmentedControl>;

export const Default: Story = {
  render: function Default() {
    const [value, setValue] = useState('complete');
    return (
      <SegmentedControl
        label="How much should we do?"
        value={value}
        onValueChange={setValue}
        options={[
          { value: 'tidy', label: 'Tidy up' },
          { value: 'complete', label: 'Complete it' },
          { value: 'study_guide', label: 'Study guide' },
        ]}
      />
    );
  },
};

export const Variants: Story = {
  render: function Variants() {
    const [depth, setDepth] = useState('thorough');
    const [visuals, setVisuals] = useState('auto');
    return (
      <Panel width={420}>
        <Stack gap={24}>
          <Case label="small">
            <SegmentedControl
              size="sm"
              label="Depth"
              value={depth}
              onValueChange={setDepth}
              options={[
                { value: 'brief', label: 'Brief' },
                { value: 'match', label: 'Match mine' },
                { value: 'thorough', label: 'Thorough' },
              ]}
            />
          </Case>
          <Case label="full width, with a disabled option">
            <SegmentedControl
              fullWidth
              label="Visuals"
              value={visuals}
              onValueChange={setVisuals}
              options={[
                { value: 'none', label: 'None' },
                { value: 'auto', label: 'Auto' },
                { value: 'more', label: 'More', disabled: true },
              ]}
            />
          </Case>
        </Stack>
      </Panel>
    );
  },
};
