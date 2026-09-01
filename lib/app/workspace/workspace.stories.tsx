import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { ToastProvider } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Case, Stack } from '../../../.storybook/story-helpers';

import { ActionBar } from './action-bar';
import { VersionHistory } from './version-history';
import type { ReadingMode } from '@/lib/render/reading-mode';
import type { NoteVersion } from '@/lib/store/types';
import type { WorkspaceMode } from './action-bar';

/**
 * The workspace chrome (phase-05 §1, §13).
 *
 * Here for the axe run more than for the gallery: both of these are dense with roles that are easy
 * to get wrong — a radiogroup that is not a tablist, a menu inside a sticky bar, a dialog whose
 * list rows each carry their own button — and the accessibility suite is the only thing that
 * checks them on every commit. Everything else in the workspace needs a document, a store and an
 * open edge function; these two are pure props.
 */
const meta: Meta = {
  title: 'Workspace/Chrome',
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <TooltipProvider delayDuration={200}>
        <ToastProvider>
          <Story />
        </ToastProvider>
      </TooltipProvider>
    ),
  ],
};

export default meta;

function Bar({ canShowOriginal = true, edited = false, saving = false }) {
  const [mode, setMode] = useState<WorkspaceMode>('read');
  const [readingMode, setReadingMode] = useState<ReadingMode>('everything');

  return (
    <ActionBar
      mode={mode}
      onModeChange={setMode}
      readingMode={readingMode}
      onReadingModeChange={setReadingMode}
      canShowOriginal={canShowOriginal}
      saving={saving}
      edited={edited}
      canUndo={edited}
      onUndo={() => {}}
      onRegenerate={() => {}}
      onHistory={() => {}}
      onUnavailable={() => {}}
    />
  );
}

export const Bars: StoryObj = {
  render: () => (
    <Stack>
      <Case label="Reading">
        <Bar />
      </Case>
      <Case label="Edited">
        <Bar edited />
      </Case>
      <Case label="Saving">
        <Bar edited saving />
      </Case>
      <Case label="Nothing of their own">
        <Bar canShowOriginal={false} />
      </Case>
    </Stack>
  ),
};

const VERSIONS: NoteVersion[] = [
  {
    id: 'v3',
    noteId: 'n1',
    createdAt: Date.now() - 60_000,
    reason: 'edit',
    label: 'Edited',
    doc: {} as NoteVersion['doc'],
  },
  {
    id: 'v2',
    noteId: 'n1',
    createdAt: Date.now() - 45 * 60_000,
    reason: 'regenerated',
    label: 'Rewrote “1.2 Isotopes”',
    doc: {} as NoteVersion['doc'],
  },
  {
    id: 'v1',
    noteId: 'n1',
    createdAt: Date.now() - 3 * 24 * 60 * 60_000,
    reason: 'generated',
    label: 'Generated',
    doc: {} as NoteVersion['doc'],
  },
];

function History({ versions }: { versions: NoteVersion[] }) {
  const [open, setOpen] = useState(true);
  return (
    <VersionHistory open={open} onOpenChange={setOpen} versions={versions} onRestore={() => {}} />
  );
}

export const History_Full: StoryObj = {
  name: 'Version history',
  render: () => <History versions={VERSIONS} />,
};

export const History_Empty: StoryObj = {
  name: 'Version history — nothing yet',
  render: () => <History versions={[]} />,
};
