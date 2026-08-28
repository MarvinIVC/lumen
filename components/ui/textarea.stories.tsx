import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Case, Panel, Stack } from '../../.storybook/story-helpers';

import { Field } from './field';
import { Textarea } from './textarea';

const meta = {
  title: 'Primitives/Textarea',
  component: Textarea,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Panel width={520}>
      <Field
        label="Paste your notes"
        hint="Anything goes — bullet fragments, half-finished examples."
      >
        <Textarea placeholder="1.1 mole = 6.022e23…" rows={5} />
      </Field>
    </Panel>
  ),
};

/** `prose` is for note *content* — serif, note leading, a reading measure. */
export const Prose: Story = {
  render: () => (
    <Panel width={620}>
      <Stack gap={20}>
        <Case label="prose — used by the extraction editor">
          <Textarea
            prose
            rows={6}
            aria-label="Extracted notes"
            defaultValue={
              'A mole is a count, like a dozen, just very large. One mole = 6.022 × 10²³ items.\n\nAtomic mass and molar mass are numerically equal but are not the same quantity.'
            }
          />
        </Case>
        <Case label="disabled">
          <Textarea
            disabled
            aria-label="Extracted notes, read-only"
            defaultValue="Read-only while we re-run the extraction."
          />
        </Case>
      </Stack>
    </Panel>
  ),
};
