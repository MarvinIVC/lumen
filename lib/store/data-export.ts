'use client';

import { flattenDocument } from './library';
import { getDb } from './db';
import { listNotes } from './drafts';

export async function downloadAllNotes(): Promise<void> {
  const notes = await listNotes(10_000);
  const { strToU8, zipSync } = await import('fflate');
  const files: Record<string, Uint8Array> = {};
  notes.forEach((note, index) => {
    const name = safeName(note.title) || `lesson-${index + 1}`;
    const metadata = [
      `# ${note.title}`,
      '',
      `- Subject: ${note.context.subject || 'General'}`,
      `- Course: ${note.context.course || 'Unsorted'}`,
      `- Updated: ${new Date(note.updatedAt).toISOString()}`,
      '',
    ];
    files[`${String(index + 1).padStart(3, '0')}-${name}.md`] = strToU8(
      `${metadata.join('\n')}${flattenDocument(note.generated) || note.doc.blocks.map((block) => block.text ?? '').join('\n\n')}\n`,
    );
  });
  const bytes = zipSync(files, { level: 6 });
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `lumen-notes-${new Date().toISOString().slice(0, 10)}.zip`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function clearAllLocalData(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const stores = [
    'drafts',
    'assets',
    'notes',
    'versions',
    'courses',
    'units',
    'outbox',
    'syncMeta',
  ] as const;
  const tx = db.transaction(stores, 'readwrite');
  await Promise.all(stores.map((name) => tx.objectStore(name).clear()));
  await tx.done;
}

function safeName(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}
