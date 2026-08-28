import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Button } from './button';
import { Drawer, DrawerClose, DrawerContent, DrawerTrigger } from './drawer';

const meta: Meta<typeof Drawer> = {
  title: 'Primitives/Drawer',
  component: Drawer,
  parameters: { layout: 'centered', viewport: { value: 'mobile' } },
};

export default meta;
type Story = StoryObj<typeof Drawer>;

export const BottomSheet: Story = {
  render: () => (
    <Drawer>
      <DrawerTrigger asChild>
        <Button>Export</Button>
      </DrawerTrigger>
      <DrawerContent
        title="Export"
        description="Pick a format. Everything is generated in your browser."
        footer={
          <DrawerClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DrawerClose>
        }
      >
        <ul className="flex flex-col gap-3 text-text-muted">
          <li>PDF — looks like a handout, keeps the sidenotes</li>
          <li>Word — editable, close enough</li>
          <li>Markdown — portable, Obsidian-friendly</li>
          <li>Anki — your flashcards as a deck</li>
        </ul>
      </DrawerContent>
    </Drawer>
  ),
};

/** The outline rail becomes this on a narrow screen. */
export const LeftPanel: Story = {
  render: () => (
    <Drawer>
      <DrawerTrigger asChild>
        <Button>Outline</Button>
      </DrawerTrigger>
      <DrawerContent side="left" title="Outline" description="Jump to a section.">
        <ol className="flex flex-col gap-2.5 text-text-muted">
          <li>1.1 The mole and molar mass</li>
          <li>1.2 Isotopes and mass spectrometry</li>
          <li>1.3 Pure substances and formulas</li>
          <li>1.4 Mixtures</li>
        </ol>
      </DrawerContent>
    </Drawer>
  ),
};
