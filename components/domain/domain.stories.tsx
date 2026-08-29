import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Button } from '@/components/ui/button';
import { FlaskIcon, BookIcon, QuoteIcon } from '@/components/ui/icons';
import { Case, Panel, Stack } from '../../.storybook/story-helpers';
import type { EnhanceOptions } from '@/lib/ai/schema';

import { BYOKForm } from './byok-form';
import { ContextCard } from './context-card';
import { CostDashboard } from './cost-dashboard';
import { ExportMenu } from './export-menu';
import { ExtractionEditor } from './extraction-editor';
import { FileDropzone } from './file-dropzone';
import type { UploadItem } from './file-dropzone';
import { IntegrationButton } from './integration-button';
import { LibraryTree } from './library-tree';
import { NoteCard } from './note-card';
import { OptionsPanel } from './options-panel';
import { QuotaMeter } from './quota-meter';
import { ShareDialog } from './share-dialog';
import { SubjectPicker } from './subject-picker';

/**
 * The product's own components. Most are shells here — phase-03 to phase-08 wire them to real
 * data — but the copy and the states are not placeholders: an error state written later is an
 * error state written badly.
 */
const meta: Meta = {
  title: 'Domain/Components',
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj;

const FILES: UploadItem[] = [
  { id: '1', name: 'ap-chem-unit-1-notes.docx', size: 48_200, kind: 'document', state: 'done' },
  {
    id: '2',
    name: 'whiteboard-mole-diagram.jpg',
    size: 1_840_000,
    kind: 'image',
    state: 'reading',
    progress: 64,
  },
  {
    id: '3',
    name: 'lab-handout-scan.pdf',
    size: 2_100_000,
    kind: 'document',
    state: 'error',
    error: 'This looks like a scan with no text in it. Run OCR on it, or paste the text instead.',
  },
];

export const Dropzone: Story = {
  render: () => (
    <Panel width={560}>
      <Stack gap={32}>
        <Case label="empty">
          <FileDropzone items={[]} onFiles={() => {}} />
        </Case>
        <Case label="reading, read, and one that could not be">
          <FileDropzone items={FILES} onFiles={() => {}} onRemove={() => {}} />
        </Case>
      </Stack>
    </Panel>
  ),
};

/** The tone shifts with confidence: sure states it, unsure asks. */
export const Context: Story = {
  render: () => (
    <Panel width={520}>
      <Stack gap={24}>
        <Case label="confident">
          <ContextCard
            context={{
              subject: 'Chemistry',
              curriculum: 'AP',
              course: 'AP Chemistry',
              unit: 'Unit 1',
              topic: 'The mole and isotopes',
              language: 'en',
            }}
            confidence={0.94}
            packName="AP Chemistry pack"
            onEdit={() => {}}
          />
        </Case>
        <Case label="unsure — asks instead of guessing silently">
          <ContextCard
            context={{
              subject: 'Science',
              curriculum: 'UNKNOWN',
              course: 'Untitled course',
              unit: null,
              topic: null,
              language: 'en',
            }}
            confidence={0.31}
            onEdit={() => {}}
          />
        </Case>
      </Stack>
    </Panel>
  ),
};

export const Options: Story = {
  render: function Options() {
    const [options, setOptions] = useState<EnhanceOptions>({
      mode: 'complete',
      depth: 'thorough',
      visuals: 'auto',
      voice: 'keep-mine',
    });
    return (
      <Panel width={380}>
        <Stack gap={32}>
          <Case label="with an estimate">
            <OptionsPanel
              options={options}
              onChange={setOptions}
              estimate={{ amount: '¥0.06', duration: 'about 40 seconds', provisional: true }}
            />
          </Case>
          <Case label="before the files are read">
            <OptionsPanel options={options} onChange={setOptions} />
          </Case>
        </Stack>
      </Panel>
    );
  },
};

export const Quota: Story = {
  render: () => (
    <Panel width={340}>
      <Stack gap={24}>
        <Case label="plenty left">
          <QuotaMeter used={1} total={5} resetsIn="at midnight" />
        </Case>
        <Case label="nearly out">
          <QuotaMeter used={4} total={5} resetsIn="at midnight" />
        </Case>
        <Case label="used up">
          <QuotaMeter used={5} total={5} resetsIn="at midnight" />
        </Case>
        <Case label="own key — no cap applies">
          <QuotaMeter used={0} total={5} ownKey />
        </Case>
      </Stack>
    </Panel>
  ),
};

export const Notes: Story = {
  render: () => (
    <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <NoteCard
        href="#"
        title="Atomic Structure & Properties — The Mole, Isotopes, and Formulas"
        course="AP Chemistry"
        unit="Unit 1"
        updatedAt="2026-08-24"
        corrections={4}
        openQuestions={2}
      />
      <NoteCard
        href="#"
        title="Period 3: Colonial society on the eve of revolution"
        course="AP US History"
        unit="Period 3"
        updatedAt="2026-08-19"
        corrections={0}
        openQuestions={0}
        localOnly
      />
    </div>
  ),
};

export const Extraction: Story = {
  render: () => (
    <Panel width={620}>
      <ExtractionEditor
        fileName="ap-chem-unit-1-notes.docx"
        pages={[
          {
            marker: 'Page 1',
            text: '1.1 mole = 6.022e23. atomic mass = molar mass. A mole is an amount.\nHg example: 32.0 cm3, density 13.584 -> how many atoms?',
          },
          {
            marker: 'Page 2 (photo)',
            confidence: 0.62,
            text: 'isotopes — same element diff neutrons\nrel abundance = how many of that isotope\nmass spec: m/z on x, abundance on y',
          },
        ]}
      />
    </Panel>
  ),
};

export const Library: Story = {
  render: function Library() {
    const [selected, setSelected] = useState('u1');
    return (
      <Panel width={280}>
        <LibraryTree
          selectedId={selected}
          onSelect={setSelected}
          nodes={[
            {
              id: 'chem',
              label: 'AP Chemistry',
              count: 6,
              children: [
                { id: 'u1', label: 'Unit 1 — Atomic structure', count: 3 },
                { id: 'u2', label: 'Unit 2 — Bonding', count: 2 },
                { id: 'u3', label: 'Unit 3 — Intermolecular forces', count: 1 },
              ],
            },
            {
              id: 'hist',
              label: 'AP US History',
              count: 2,
              children: [{ id: 'p3', label: 'Period 3', count: 2 }],
            },
          ]}
        />
      </Panel>
    );
  },
};

export const Subjects: Story = {
  render: function Subjects() {
    const [selected, setSelected] = useState('chem');
    return (
      <Panel width={520}>
        <SubjectPicker
          selectedId={selected}
          onSelect={setSelected}
          subjects={[
            { id: 'chem', label: 'Chemistry', icon: <FlaskIcon /> },
            { id: 'bio', label: 'Biology', icon: <FlaskIcon /> },
            { id: 'phys', label: 'Physics', icon: <FlaskIcon /> },
            { id: 'hist', label: 'History', icon: <BookIcon /> },
            { id: 'eng', label: 'English', icon: <QuoteIcon /> },
          ]}
        />
      </Panel>
    );
  },
};

export const Sharing: Story = {
  parameters: { layout: 'centered' },
  render: function Sharing() {
    const [url, setUrl] = useState<string | null>(null);
    const [allowIndex, setAllowIndex] = useState(false);
    return (
      <ShareDialog
        url={url}
        onCreate={() => setUrl('https://lumen.app/s/8f3c2a')}
        onRevoke={() => setUrl(null)}
        allowIndex={allowIndex}
        onAllowIndexChange={setAllowIndex}
      />
    );
  },
};

export const Exporting: Story = {
  parameters: { layout: 'centered' },
  render: function Exporting() {
    const [options, setOptions] = useState({
      includeStudyTools: true,
      includeProvenance: true,
    });
    return <ExportMenu options={options} onOptionsChange={setOptions} onExport={() => {}} />;
  },
};

export const Integrations: Story = {
  render: () => (
    <Panel width={480}>
      <Stack gap={12}>
        <IntegrationButton
          name="Notion"
          state="disconnected"
          onConnect={() => {}}
          onPush={() => {}}
        />
        <IntegrationButton
          name="Notion"
          state="connected"
          target="Chemistry ▸ Unit 1"
          onConnect={() => {}}
          onPush={() => {}}
        />
        <IntegrationButton
          name="Google Drive"
          state="expired"
          onConnect={() => {}}
          onPush={() => {}}
        />
      </Stack>
    </Panel>
  ),
};

export const BringYourOwnKey: Story = {
  render: function BringYourOwnKey() {
    const [provider, setProvider] = useState('deepseek');
    return (
      <Panel width={420}>
        <Stack gap={32}>
          <Case label="no key yet">
            <BYOKForm
              provider={provider}
              onProviderChange={setProvider}
              hasKey={false}
              onSave={() => {}}
              onRemove={() => {}}
            />
          </Case>
          <Case label="a key is stored — and is never shown again">
            <BYOKForm
              provider={provider}
              onProviderChange={setProvider}
              hasKey
              onSave={() => {}}
              onRemove={() => {}}
              error="That key was rejected by DeepSeek. Check you copied all of it."
            />
          </Case>
        </Stack>
      </Panel>
    );
  },
};

/** The monthly figure is the ceiling; the daily one is a burst guard. The layout says so. */
export const Cost: Story = {
  render: () => (
    <Panel width={720}>
      <CostDashboard
        currency="¥"
        monthToDate={61.4}
        monthlyCap={100}
        dailySpend={4.2}
        dailyCap={6}
        killSwitchOn={false}
        recent={[
          { label: 'Mon', value: 2.1 },
          { label: 'Tue', value: 3.4 },
          { label: 'Wed', value: 5.8 },
          { label: 'Thu', value: 4.9 },
          { label: 'Fri', value: 4.2 },
        ]}
      />
    </Panel>
  ),
};

export const Streaming: Story = {
  parameters: { layout: 'centered' },
  render: () => (
    <Panel width={420}>
      <p className="font-sans text-sm text-text-muted">
        `StreamingDoc` renders a whole note as it arrives, so it lives with the renderer — see{' '}
        <strong>Notes ▸ StreamingDoc</strong>.
      </p>
      <div className="mt-3">
        <Button variant="ghost" size="sm" asChild>
          <a href="?path=/story/notes-streamingdoc--arriving">Open it</a>
        </Button>
      </div>
    </Panel>
  ),
};
