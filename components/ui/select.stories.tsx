import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Panel, Stack } from '../../.storybook/story-helpers';

import { Field } from './field';
import { Select, SelectGroup, SelectItem, SelectLabel, SelectSeparator } from './select';

const meta: Meta<typeof Select> = {
  title: 'Primitives/Select',
  component: Select,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof Select>;

export const Default: Story = {
  render: () => (
    <Panel>
      <Field label="Curriculum">
        <Select placeholder="Pick one" defaultValue="AP">
          <SelectGroup>
            <SelectLabel>Exam boards</SelectLabel>
            <SelectItem value="AP">AP</SelectItem>
            <SelectItem value="IB_HL">IB Higher Level</SelectItem>
            <SelectItem value="IB_SL">IB Standard Level</SelectItem>
            <SelectItem value="A_LEVEL">A-Level</SelectItem>
            <SelectItem value="IGCSE">IGCSE</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectItem value="INTERNAL">My school&rsquo;s own course</SelectItem>
          <SelectItem value="GENERAL">Not sure yet</SelectItem>
        </Select>
      </Field>
    </Panel>
  ),
};

export const States: Story = {
  render: () => (
    <Panel>
      <Stack gap={20}>
        <Select placeholder="Nothing chosen yet" aria-label="Subject">
          <SelectItem value="a">Chemistry</SelectItem>
          <SelectItem value="b">Biology</SelectItem>
        </Select>
        <Select placeholder="Disabled" disabled aria-label="Subject, unavailable">
          <SelectItem value="a">Chemistry</SelectItem>
        </Select>
      </Stack>
    </Panel>
  ),
};
