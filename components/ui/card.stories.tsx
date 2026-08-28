import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Case, Panel, Stack } from '../../.storybook/story-helpers';

import { Card } from './card';

const meta: Meta<typeof Card> = {
  title: 'Primitives/Card',
  component: Card,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: () => (
    <Panel width={360}>
      <Card>
        <p className="text-sm font-medium text-text">Atomic Structure &amp; Properties</p>
        <p className="mt-1 text-sm text-text-muted">AP Chemistry · Unit 1 · 4 corrections</p>
      </Card>
    </Panel>
  ),
};

export const Variants: Story = {
  render: () => (
    <Panel width={360}>
      <Stack gap={20}>
        <Case label="raised">
          <Card>
            <p className="text-sm text-text-muted">The default card surface.</p>
          </Card>
        </Case>
        <Case label="sunken — a quiet inset panel">
          <Card surface="sunken">
            <p className="text-sm text-text-muted">Used behind definitions and code samples.</p>
          </Card>
        </Case>
        <Case label="interactive — lifts on hover">
          <Card interactive>
            <p className="text-sm text-text-muted">Hover me.</p>
          </Card>
        </Case>
      </Stack>
    </Panel>
  ),
};
