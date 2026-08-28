import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Row } from '../../.storybook/story-helpers';

import { Badge } from './badge';
import { CheckIcon, SparkIcon } from './icons';

const meta: Meta<typeof Badge> = {
  title: 'Primitives/Badge',
  component: Badge,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof Badge>;

export const Default: Story = { render: () => <Badge>AP Chemistry</Badge> };

export const Tones: Story = {
  render: () => (
    <Row>
      <Badge>Unit 1</Badge>
      <Badge tone="accent">Pack: AP Chem</Badge>
      <Badge tone="success" icon={<CheckIcon />}>
        Checked
      </Badge>
      <Badge tone="warning">Double-check this</Badge>
      <Badge tone="danger">Quota reached</Badge>
      <Badge tone="ai" icon={<SparkIcon />}>
        added
      </Badge>
    </Row>
  ),
};
