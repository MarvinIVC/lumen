import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Panel, Stack } from '../../.storybook/story-helpers';

import { Button } from './button';
import { EmptyState } from './empty-state';
import { AlertTriangleIcon, BookIcon, UploadIcon } from './icons';

const meta: Meta<typeof EmptyState> = {
  title: 'Primitives/EmptyState',
  component: EmptyState,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof EmptyState>;

export const Default: Story = {
  render: () => (
    <Panel width={520}>
      <EmptyState
        icon={<BookIcon />}
        title="Nothing here yet"
        description="Upload the notes you already have — a Word file, a PDF, or a photo of the whiteboard."
        action={
          <Button variant="primary" icon={<UploadIcon />}>
            Add notes
          </Button>
        }
      />
    </Panel>
  ),
};

export const Error: Story = {
  render: () => (
    <Panel width={520}>
      <Stack gap={24}>
        <EmptyState
          tone="warning"
          icon={<AlertTriangleIcon />}
          title="We could not read that PDF"
          description="It looks like a scan with no text layer. Run OCR on it, or paste the text in directly."
          action={<Button variant="primary">Run OCR</Button>}
          secondaryAction={<Button variant="ghost">Paste text instead</Button>}
        />
        <EmptyState
          tone="danger"
          icon={<AlertTriangleIcon />}
          title="You have used today’s free study guides"
          description="The quota resets at midnight. You can add your own API key to keep going now."
          action={<Button variant="primary">Add my key</Button>}
        />
      </Stack>
    </Panel>
  ),
};
