import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Case, Stack } from '../../.storybook/story-helpers';

import { Radio, RadioGroup } from './radio-group';

const meta: Meta<typeof RadioGroup> = {
  title: 'Primitives/RadioGroup',
  component: RadioGroup,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof RadioGroup>;

export const Default: Story = {
  render: () => (
    <RadioGroup defaultValue="complete" aria-label="How much should we do?">
      <Radio value="tidy" label="Tidy up" hint="Fix the wording and the layout. Add nothing." />
      <Radio
        value="complete"
        label="Complete it"
        hint="Finish the half-written examples and fill the gaps."
      />
      <Radio
        value="study_guide"
        label="Make a study guide"
        hint="Everything above, plus flashcards and a quiz."
      />
    </RadioGroup>
  ),
};

export const States: Story = {
  render: () => (
    <Stack gap={20}>
      <Case label="disabled option">
        <RadioGroup defaultValue="local" aria-label="Where should this be saved?">
          <Radio value="local" label="This browser only" />
          <Radio value="account" label="My account" hint="Sync across devices." />
          <Radio value="notion" label="Notion" disabled hint="Connect Notion first." />
        </RadioGroup>
      </Case>
      <Case label="whole group disabled">
        <RadioGroup defaultValue="a" disabled aria-label="Locked group">
          <Radio value="a" label="Option A" />
          <Radio value="b" label="Option B" />
        </RadioGroup>
      </Case>
    </Stack>
  ),
};
