import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Case, Panel, Stack } from '../../.storybook/story-helpers';

import { Field } from './field';
import { Input } from './input';

const meta: Meta<typeof Field> = {
  title: 'Primitives/Field',
  component: Field,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof Field>;

/** Field is the wiring, not a look: label, hint, error and `aria-*` all point at each other. */
export const Default: Story = {
  render: () => (
    <Panel>
      <Stack gap={24}>
        <Case label="label + hint">
          <Field label="Unit" hint="Chapter or unit number, if your notes say.">
            <Input placeholder="Unit 1" />
          </Field>
        </Case>
        <Case label="required">
          <Field label="Course" required>
            <Input placeholder="AP Chemistry" />
          </Field>
        </Case>
        <Case label="error — says what happened and what to do">
          <Field label="Course" required error="Tell us the course so we can pick the right pack.">
            <Input />
          </Field>
        </Case>
        <Case label="visually hidden label">
          <Field label="Search" labelHidden>
            <Input placeholder="Search your library" />
          </Field>
        </Case>
      </Stack>
    </Panel>
  ),
};
