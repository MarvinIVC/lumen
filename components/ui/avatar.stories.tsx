import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Row } from '../../.storybook/story-helpers';

import { Avatar } from './avatar';

const meta: Meta<typeof Avatar> = {
  title: 'Primitives/Avatar',
  component: Avatar,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof Avatar>;

export const Default: Story = { render: () => <Avatar name="Marvin Wang" /> };

export const Sizes: Story = {
  render: () => (
    <Row>
      <Avatar name="Marvin Wang" size="sm" />
      <Avatar name="Marvin Wang" size="md" />
      <Avatar name="Marvin Wang" size="lg" />
      <Avatar name="chemistry" size="lg" />
    </Row>
  ),
};
