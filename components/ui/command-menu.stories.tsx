import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Button } from './button';
import { CommandMenu } from './command-menu';
import type { CommandItem } from './command-menu';
import { BookIcon, DownloadIcon, FlaskIcon, SparkIcon, UploadIcon } from './icons';

const meta: Meta<typeof CommandMenu> = {
  title: 'Primitives/CommandMenu',
  component: CommandMenu,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof CommandMenu>;

const ITEMS: CommandItem[] = [
  {
    id: 'new',
    label: 'New study guide',
    keywords: 'create upload add',
    group: 'Actions',
    icon: <UploadIcon />,
    shortcut: '⌘N',
    onSelect: () => {},
  },
  {
    id: 'export',
    label: 'Export this note',
    keywords: 'pdf docx anki markdown download',
    group: 'Actions',
    icon: <DownloadIcon />,
    shortcut: '⌘E',
    onSelect: () => {},
  },
  {
    id: 'highlight',
    label: 'Highlight AI additions',
    keywords: 'provenance marks reading mode',
    group: 'Actions',
    icon: <SparkIcon />,
    onSelect: () => {},
  },
  {
    id: 'chem-u1',
    label: 'AP Chemistry · Unit 1 — Atomic Structure & Properties',
    group: 'Your notes',
    icon: <FlaskIcon />,
    onSelect: () => {},
  },
  {
    id: 'chem-u2',
    label: 'AP Chemistry · Unit 2 — Molecular and Ionic Bonding',
    group: 'Your notes',
    icon: <FlaskIcon />,
    onSelect: () => {},
  },
  {
    id: 'hist',
    label: 'AP US History · Period 3',
    group: 'Your notes',
    icon: <BookIcon />,
    onSelect: () => {},
  },
];

export const Default: Story = {
  render: function Demo() {
    const [open, setOpen] = useState(true);
    return (
      <>
        <Button onClick={() => setOpen(true)} trailing="⌘K">
          Search
        </Button>
        <CommandMenu items={ITEMS} open={open} onOpenChange={setOpen} />
      </>
    );
  },
};

export const Closed: Story = {
  render: function Demo() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)} trailing="⌘K">
          Open the command menu
        </Button>
        <CommandMenu items={ITEMS} open={open} onOpenChange={setOpen} />
      </>
    );
  },
};
