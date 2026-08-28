import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Case, Row, Stack } from '../../.storybook/story-helpers';

import { Chip } from './chip';
import { FileIcon, FlaskIcon, ImageIcon } from './icons';

const meta: Meta<typeof Chip> = {
  title: 'Primitives/Chip',
  component: Chip,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof Chip>;

export const Default: Story = {
  render: () => <Chip icon={<FlaskIcon />}>Chemistry</Chip>,
};

export const Variants: Story = {
  render: function Variants() {
    const [selected, setSelected] = useState('chemistry');
    return (
      <Stack gap={24}>
        <Case label="static — a file, a subject">
          <Row>
            <Chip icon={<FileIcon />}>unit-1-notes.docx</Chip>
            <Chip icon={<ImageIcon />}>whiteboard-photo.jpg</Chip>
          </Row>
        </Case>
        <Case label="removable">
          <Row>
            <Chip icon={<FileIcon />} onRemove={() => {}} removeLabel="Remove unit-1-notes.docx">
              unit-1-notes.docx
            </Chip>
          </Row>
        </Case>
        <Case label="selectable">
          <Row>
            {['chemistry', 'biology', 'physics'].map((subject) => (
              <Chip
                key={subject}
                selected={selected === subject}
                onSelect={() => setSelected(subject)}
              >
                {subject}
              </Chip>
            ))}
          </Row>
        </Case>
      </Stack>
    );
  },
};
