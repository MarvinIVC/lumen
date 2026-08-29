'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SparkIcon } from '@/components/ui/icons';
import { ContextCard } from '@/components/domain/context-card';
import { FileDropzone } from '@/components/domain/file-dropzone';
import type { UploadItem } from '@/components/domain/file-dropzone';
import { OptionsPanel } from '@/components/domain/options-panel';
import { QuotaMeter } from '@/components/domain/quota-meter';
import type { EnhanceOptions } from '@/lib/ai/schema';

/**
 * Hero screen 2: everything between dropping a file and pressing the button.
 *
 * Wired to local state only — phase-03 brings the parsers and phase-04 the model. The point of
 * building it now is that this screen is where a student decides whether to trust the product,
 * and that decision is made out of layout and copy rather than out of behaviour.
 */
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

export default function NewNotePage() {
  const [options, setOptions] = useState<EnhanceOptions>({
    mode: 'complete',
    depth: 'thorough',
    visuals: 'auto',
    voice: 'keep-mine',
  });
  const [files, setFiles] = useState<UploadItem[]>(FILES);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-10">
      <header>
        <h1 className="font-serif text-3xl font-semibold text-text">New study guide</h1>
        <p className="mt-2 max-w-prose font-sans text-text-muted">
          Upload the notes you already have. We read them in your browser — nothing is sent anywhere
          until you press the button.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-6">
          <FileDropzone
            items={files}
            onFiles={() => {}}
            onRemove={(id) => setFiles((current) => current.filter((file) => file.id !== id))}
          />

          <ContextCard
            context={{
              subject: 'Chemistry',
              curriculum: 'AP',
              course: 'AP Chemistry',
              unit: 'Unit 1 (Topics 1.1–1.4)',
              topic: 'The mole, isotopes and formulas',
              language: 'en',
            }}
            confidence={0.92}
            packName="AP Chemistry pack"
            onEdit={() => {}}
          />
        </div>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-8 lg:self-start">
          <OptionsPanel
            options={options}
            onChange={setOptions}
            estimate={{ amount: '¥0.06', duration: 'about 40 seconds', provisional: true }}
          />

          <Separator />

          <QuotaMeter used={2} total={5} resetsIn="at midnight" />

          <Button variant="primary" size="lg" fullWidth icon={<SparkIcon />}>
            Create study guide
          </Button>
          <p className="font-sans text-xs leading-snug text-text-muted">
            We check our work, but it can still be wrong. Anything we are unsure about is marked for
            you to confirm.
          </p>
        </aside>
      </div>
    </main>
  );
}
