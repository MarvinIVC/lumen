import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Case, Stack } from '../../.storybook/story-helpers';

import { Checkbox } from './checkbox';

const meta: Meta<typeof Checkbox> = {
  title: 'Primitives/Checkbox',
  component: Checkbox,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof Checkbox>;

export const Default: Story = {
  render: () => <Checkbox defaultChecked label="Include flashcards and a quiz" />,
};

export const States: Story = {
  render: () => (
    <Stack gap={20}>
      <Case label="unchecked, checked, indeterminate">
        <Stack gap={12}>
          <Checkbox label="Notes only" />
          <Checkbox defaultChecked label="Notes and study tools" />
          <Checkbox checked="indeterminate" label="Some subjects selected" />
        </Stack>
      </Case>
      <Case label="with a hint">
        <Checkbox
          defaultChecked
          label="Keep the AI provenance marks"
          hint="Exports show which parts we added or corrected."
        />
      </Case>
      <Case label="disabled">
        <Stack gap={12}>
          <Checkbox disabled label="Push to Notion" hint="Connect Notion first." />
          <Checkbox disabled defaultChecked label="Locked on" />
        </Stack>
      </Case>
    </Stack>
  ),
};

/** Controlled, so the story also proves the state actually round-trips. */
export const Controlled: Story = {
  render: function Controlled() {
    const [checked, setChecked] = useState(true);
    return (
      <Checkbox
        checked={checked}
        onCheckedChange={(next) => setChecked(next === true)}
        label={checked ? 'Study tools are on' : 'Study tools are off'}
      />
    );
  },
};
