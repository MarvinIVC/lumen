'use client';

/**
 * The export menu, wired to the exporters (06 §2).
 *
 * Kept out of `ActionBar` deliberately: this is the only part of the bar that touches storage and
 * spawns a Worker, and the bar itself is rendered in stories where neither exists.
 *
 * Every format is produced in the browser and nothing is uploaded, which is worth saying in the
 * menu rather than in a privacy page — it is the difference between "we send your notes somewhere"
 * and "we don't", and that is a claim people only believe where the action is.
 */
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ExportMenu } from '@/components/domain/export-menu';
import { useToast } from '@/components/ui/toast';
import { appStrings } from '@/lib/app/strings';
import { printHref } from '@/lib/app/routes';
import { DEFAULT_EXPORT_OPTIONS } from '@/lib/export/types';
import type { ExportFormat, ExportOptions } from '@/lib/export/types';
import { readExportOptions, writeExportOptions } from '@/lib/store/preferences';
import { markExported } from '@/lib/store/drafts';
import type { NoteDocument } from '@/lib/ai/schema';
import type { LocalNote } from '@/lib/store/types';

const strings = appStrings.workspace;

/**
 * `doc` is the workspace's live document rather than `note.generated` — see `modelFor`. Exporting
 * the stored copy loses every figure, because the block ids the rasteriser looks elements up by
 * are minted on load.
 */
export function ExportControls({ note, doc }: { note: LocalNote; doc: NoteDocument }) {
  const [options, setOptions] = useState<ExportOptions>(() =>
    readExportOptions(DEFAULT_EXPORT_OPTIONS),
  );
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const toast = useToast();
  const router = useRouter();

  function choose(next: ExportOptions) {
    setOptions(next);
    writeExportOptions(next);
  }

  async function run(format: ExportFormat) {
    // The PDF is not a file we build — it is the browser's own typesetter, on a route that lays
    // the note into pages. See `print-screen.tsx`.
    if (format === 'pdf') {
      router.push(printHref(note.id));
      return;
    }
    if (busy) return;

    setBusy(format);
    toast({ title: strings.exportStarted(format), description: strings.exportLocal });

    try {
      // Imported here rather than at the top so that a student who never exports downloads none of
      // it — `fflate` and the Word worker are both behind this call.
      const { exportAnki, exportMarkdown } = await import('@/lib/export/bundle');
      if (format === 'markdown') await exportMarkdown(note, doc, options);
      else if (format === 'anki') await exportAnki(note, doc, options);
      else {
        const { exportDocx } = await import('@/lib/export/docx');
        await exportDocx(note, doc, options);
      }
      await markExported(note.id);
      toast({ title: strings.exportDone(format), tone: 'success' });
    } catch (error) {
      toast({
        title: strings.exportFailed,
        description: error instanceof Error ? error.message : strings.exportFailedBody,
        tone: 'danger',
      });
    } finally {
      setBusy(null);
    }
  }

  return <ExportMenu options={options} onOptionsChange={choose} onExport={(f) => void run(f)} />;
}
