import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Panel, Stack } from '../../.storybook/story-helpers';

import { Separator } from './separator';

const meta: Meta<typeof Separator> = {
  title: 'Primitives/Separator',
  component: Separator,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof Separator>;

export const Default: Story = {
  render: () => (
    <Panel width={360}>
      <Stack gap={16}>
        <p className="text-sm text-text-muted">Above</p>
        <Separator />
        <p className="text-sm text-text-muted">Below</p>
      </Stack>
    </Panel>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className="flex h-10 items-center gap-4">
      <span className="text-sm text-text-muted">AP Chemistry</span>
      <Separator orientation="vertical" />
      <span className="text-sm text-text-muted">Unit 1</span>
      <Separator orientation="vertical" />
      <span className="text-sm text-text-muted">English</span>
    </div>
  ),
};
