import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Case, Panel, Stack } from '../../.storybook/story-helpers';

import { Skeleton, SkeletonParagraph } from './skeleton';

const meta: Meta<typeof Skeleton> = {
  title: 'Primitives/Skeleton',
  component: Skeleton,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof Skeleton>;

export const Default: Story = {
  render: () => (
    <Panel width={420}>
      <SkeletonParagraph />
    </Panel>
  ),
};

export const Shapes: Story = {
  render: () => (
    <Panel width={420}>
      <Stack gap={24}>
        <Case label="a section arriving">
          <Stack gap={12}>
            <Skeleton className="h-6 w-1/2" />
            <SkeletonParagraph lines={4} />
          </Stack>
        </Case>
        <Case label="a block">
          <Skeleton className="h-28 w-full" />
        </Case>
      </Stack>
    </Panel>
  ),
};
