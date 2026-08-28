import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Button } from './button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from './dialog';

const meta: Meta<typeof Dialog> = {
  title: 'Primitives/Dialog',
  component: Dialog,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof Dialog>;

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="danger">Delete note</Button>
      </DialogTrigger>
      <DialogContent
        size="sm"
        title="Delete “Atomic Structure & Properties”?"
        description="This removes the study guide and its flashcards from this browser. Your original upload is not affected."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">Keep it</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button variant="danger">Delete</Button>
            </DialogClose>
          </>
        }
      >
        <p className="text-text-muted">
          You have not exported this note anywhere yet, so there will be no copy left.
        </p>
      </DialogContent>
    </Dialog>
  ),
};

export const Large: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Share</Button>
      </DialogTrigger>
      <DialogContent
        size="lg"
        title="Share this study guide"
        description="Anyone with the link can read it. They cannot edit it and they will not see your name."
        footer={
          <DialogClose asChild>
            <Button variant="primary">Copy link</Button>
          </DialogClose>
        }
      >
        <p className="text-text-muted">
          Shared pages are not indexed by search engines. You can revoke the link at any time.
        </p>
      </DialogContent>
    </Dialog>
  ),
};
