import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Case, Row, Stack } from '../../.storybook/story-helpers';

import { Button } from './button';
import { ChevronRightIcon, DownloadIcon, SparkIcon, TrashIcon } from './icons';

const meta = {
  title: 'Primitives/Button',
  component: Button,
  args: { children: 'Create study guide' },
  argTypes: {
    variant: { control: 'inline-radio', options: ['primary', 'secondary', 'ghost', 'danger'] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { variant: 'primary' } };
export const Secondary: Story = { args: { variant: 'secondary' } };
export const Ghost: Story = { args: { variant: 'ghost', children: 'Cancel' } };
export const Danger: Story = { args: { variant: 'danger', children: 'Delete note' } };

export const Variants: Story = {
  parameters: { layout: 'padded' },
  render: () => (
    <Stack gap={24}>
      {(['primary', 'secondary', 'ghost', 'danger'] as const).map((variant) => (
        <Case key={variant} label={variant}>
          <Row>
            <Button variant={variant} size="sm">
              Small
            </Button>
            <Button variant={variant} size="md">
              Medium
            </Button>
            <Button variant={variant} size="lg">
              Large
            </Button>
          </Row>
        </Case>
      ))}
    </Stack>
  ),
};

export const States: Story = {
  parameters: { layout: 'padded' },
  render: () => (
    <Stack gap={24}>
      <Case label="with icons">
        <Row>
          <Button variant="primary" icon={<SparkIcon />}>
            Rebuild these notes
          </Button>
          <Button icon={<DownloadIcon />}>Export</Button>
          <Button variant="ghost" trailing={<ChevronRightIcon />}>
            Continue
          </Button>
          <Button variant="danger" icon={<TrashIcon />}>
            Delete
          </Button>
        </Row>
      </Case>
      <Case label="loading — the label stays, so the width does not jump">
        <Row>
          <Button variant="primary" loading>
            Rebuilding…
          </Button>
          <Button loading>Checking</Button>
        </Row>
      </Case>
      <Case label="disabled">
        <Row>
          <Button variant="primary" disabled>
            Create study guide
          </Button>
          <Button disabled>Export</Button>
          <Button variant="ghost" disabled>
            Cancel
          </Button>
        </Row>
      </Case>
      <Case label="full width">
        <div className="w-80">
          <Button variant="primary" fullWidth>
            Create study guide
          </Button>
        </div>
      </Case>
    </Stack>
  ),
};

/** A link that should read as a button — the anchor keeps its own semantics. */
export const AsLink: Story = {
  parameters: { layout: 'padded' },
  render: () => (
    <Row>
      <Button asChild variant="primary">
        <a href="#try">Try it with your notes</a>
      </Button>
      {/* An anchor cannot be `disabled`, so this has to hold through aria and the tab order. */}
      <Button asChild disabled>
        <a href="#unavailable">Not available yet</a>
      </Button>
    </Row>
  ),
};
