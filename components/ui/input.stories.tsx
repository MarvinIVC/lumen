import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Case, Panel, Stack } from '../../.storybook/story-helpers';

import { Field } from './field';
import { SearchIcon } from './icons';
import { Input } from './input';

const meta = {
  title: 'Primitives/Input',
  component: Input,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Panel>
      <Field label="Course" hint="However your school writes it — “AP Chem”, “Chemistry HL”.">
        <Input placeholder="AP Chemistry" />
      </Field>
    </Panel>
  ),
};

export const States: Story = {
  render: () => (
    <Panel>
      <Stack gap={20}>
        <Case label="with a leading icon">
          <Input
            icon={<SearchIcon />}
            placeholder="Search your library"
            aria-label="Search your library"
          />
        </Case>
        <Case label="with a suffix">
          <Input suffix="g·mol⁻¹" defaultValue="200.59" aria-label="Molar mass" />
        </Case>
        <Case label="small">
          <Input inputSize="sm" placeholder="Unit" aria-label="Unit" />
        </Case>
        <Case label="invalid — the error says what to do next">
          <Field
            label="Your API key"
            error="That key starts with “sk-”. DeepSeek keys start with “ds-”."
          >
            <Input defaultValue="sk-1a2b3c" />
          </Field>
        </Case>
        <Case label="disabled">
          <Input disabled defaultValue="AP Chemistry" aria-label="Course" />
        </Case>
      </Stack>
    </Panel>
  ),
};
