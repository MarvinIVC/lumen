import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Row } from '../../.storybook/story-helpers';

import { Spinner } from './spinner';

const meta = {
  title: 'Primitives/Spinner',
  component: Spinner,
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Under `prefers-reduced-motion` the arc stops and the accessible name carries the meaning. */
export const Sizes: Story = {
  render: () => (
    <Row>
      <Spinner size="sm" label="Loading small" />
      <Spinner size="md" label="Loading medium" />
      <Spinner size="lg" label="Loading large" />
    </Row>
  ),
};
