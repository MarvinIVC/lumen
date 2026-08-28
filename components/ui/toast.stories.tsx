import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Row } from '../../.storybook/story-helpers';

import { Button } from './button';
import { ToastProvider, useToast } from './toast';

const meta: Meta<typeof ToastProvider> = {
  title: 'Primitives/Toast',
  component: ToastProvider,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof ToastProvider>;

function Demo() {
  const toast = useToast();
  return (
    <Row>
      <Button onClick={() => toast({ title: 'Saved to your library', tone: 'success' })}>
        Success
      </Button>
      <Button
        onClick={() =>
          toast({
            title: 'Notion is not connected',
            description: 'Connect it in Settings, then try the push again.',
            tone: 'warning',
            action: { label: 'Open settings', onClick: () => {} },
          })
        }
      >
        Warning with an action
      </Button>
      <Button
        onClick={() =>
          toast({
            title: 'That PDF is password-protected',
            description: 'Remove the password and upload it again, or paste the text instead.',
            tone: 'danger',
          })
        }
      >
        Error
      </Button>
    </Row>
  );
}

export const Default: Story = {
  render: () => (
    <ToastProvider>
      <Demo />
    </ToastProvider>
  ),
};
