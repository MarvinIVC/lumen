import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Row } from '../../.storybook/story-helpers';

import { Button } from './button';
import { IconButton } from './icon-button';
import { InfoIcon } from './icons';
import { Tooltip, TooltipProvider } from './tooltip';

const meta: Meta<typeof Tooltip> = {
  title: 'Primitives/Tooltip',
  component: Tooltip,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <TooltipProvider delayDuration={200}>
        <Story />
      </TooltipProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Tooltip>;

export const Default: Story = {
  render: () => (
    <Tooltip content="Rebuilt with DeepSeek V4">
      <Button icon={<InfoIcon />}>Model</Button>
    </Tooltip>
  ),
};

export const Sides: Story = {
  render: () => (
    <Row>
      {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
        <Tooltip key={side} content={`Opens ${side}`} side={side}>
          <IconButton label={`Tooltip ${side}`} icon={<InfoIcon />} variant="secondary" />
        </Tooltip>
      ))}
    </Row>
  ),
};

/** The interactive variant is what an `ai-clarified` span uses to show the original wording. */
export const Interactive: Story = {
  render: () => (
    <Tooltip
      interactive
      content={
        <span>
          You wrote: <em>“relative abundance = how many of that isotope”</em>
        </span>
      }
    >
      <button type="button" className="text-sm text-link underline decoration-dotted">
        relative (fractional) abundance
      </button>
    </Tooltip>
  ),
};
