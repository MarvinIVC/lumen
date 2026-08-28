import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Button } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

const meta: Meta<typeof Popover> = {
  title: 'Primitives/Popover',
  component: Popover,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof Popover>;

export const Default: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button>What does this cost?</Button>
      </PopoverTrigger>
      <PopoverContent label="Cost estimate">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-text">About ¥0.06 for this note</p>
          <p className="text-sm leading-snug text-text-muted">
            Estimated from the length of your notes and the depth you picked. You have 3 free study
            guides left today.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  ),
};

export const OpenByDefault: Story = {
  render: () => (
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button>Anchored</Button>
      </PopoverTrigger>
      <PopoverContent label="Placement demo" side="right">
        <p className="text-sm text-text-muted">
          Collision padding keeps it on screen near the edges.
        </p>
      </PopoverContent>
    </Popover>
  ),
};
