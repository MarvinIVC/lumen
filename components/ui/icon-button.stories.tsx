import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Case, Row, Stack } from '../../.storybook/story-helpers';

import { IconButton } from './icon-button';
import { PanelLeftIcon, SearchIcon, TrashIcon, XIcon } from './icons';

const meta = {
  title: 'Primitives/IconButton',
  component: IconButton,
  args: { label: 'Close', icon: <XIcon /> },
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Variants: Story = {
  parameters: { layout: 'padded' },
  render: () => (
    <Stack gap={24}>
      <Case label="variants — the label is required, so none of these is nameless">
        <Row>
          <IconButton label="Search" icon={<SearchIcon />} variant="ghost" />
          <IconButton label="Toggle outline" icon={<PanelLeftIcon />} variant="secondary" />
          <IconButton label="Search" icon={<SearchIcon />} variant="primary" />
          <IconButton label="Delete note" icon={<TrashIcon />} variant="danger" />
        </Row>
      </Case>
      <Case label="sizes">
        <Row>
          <IconButton label="Close" icon={<XIcon />} size="sm" variant="secondary" />
          <IconButton label="Close" icon={<XIcon />} size="md" variant="secondary" />
          <IconButton label="Close" icon={<XIcon />} size="lg" variant="secondary" />
        </Row>
      </Case>
      <Case label="loading and disabled">
        <Row>
          <IconButton label="Saving" icon={<XIcon />} variant="secondary" loading />
          <IconButton label="Close" icon={<XIcon />} variant="secondary" disabled />
        </Row>
      </Case>
    </Stack>
  ),
};
