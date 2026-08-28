import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { ChevronDownIcon, DownloadIcon, ExternalLinkIcon, TrashIcon } from './icons';

const meta: Meta<typeof DropdownMenu> = {
  title: 'Primitives/DropdownMenu',
  component: DropdownMenu,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof DropdownMenu>;

export const Default: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button trailing={<ChevronDownIcon />}>Actions</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>This note</DropdownMenuLabel>
        <DropdownMenuItem icon={<DownloadIcon />} shortcut="⌘E">
          Export
        </DropdownMenuItem>
        <DropdownMenuItem icon={<ExternalLinkIcon />}>Push to Notion</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Copy as</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>Markdown</DropdownMenuItem>
            <DropdownMenuItem>Plain text</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked>Include provenance marks</DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem danger icon={<TrashIcon />}>
          Delete note
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};
