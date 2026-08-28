import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Case, Panel, Stack } from '../../.storybook/story-helpers';

import { Progress } from './progress';

const meta: Meta<typeof Progress> = {
  title: 'Primitives/Progress',
  component: Progress,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof Progress>;

export const Default: Story = {
  render: () => (
    <Panel width={320}>
      <Progress value={62} label="Reading unit-1-notes.docx" />
    </Panel>
  ),
};

export const Variants: Story = {
  render: () => (
    <Panel width={420}>
      <Stack gap={24}>
        <Case label="determinate">
          <Progress value={62} label="Reading unit-1-notes.docx" />
        </Case>
        <Case label="indeterminate — the hairline under the top bar while generating">
          <Progress label="Rebuilding your notes" variant="hairline" />
        </Case>
        <Case label="tones — the quota meter turns as it fills">
          <Stack gap={12}>
            <Progress value={40} label="Daily quota" />
            <Progress value={80} label="Daily quota" tone="warning" />
            <Progress value={100} label="Daily quota" tone="danger" />
          </Stack>
        </Case>
      </Stack>
    </Panel>
  ),
};
