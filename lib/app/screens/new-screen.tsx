'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { ArrowDownIcon, SparkIcon } from '@/components/ui/icons';
import { FileDropzone } from '@/components/domain/file-dropzone';
import type { UploadItem } from '@/components/domain/file-dropzone';
import { TurnstileWidget } from '@/components/domain/turnstile-widget';
import { appStrings } from '@/lib/app/strings';
import { APP_HOME, APP_NEW, reviewHref } from '@/lib/app/routes';
import { useDraft } from '@/lib/app/use-draft';
import { flushDraft, useDraftStore } from '@/lib/store/draft-store';

/**
 * `/app/new` — where a note begins (01-PRODUCT.md §2 step 2).
 *
 * Everything on this screen is local. Files are read in the browser, the draft is written to
 * IndexedDB as it changes, and the only network request the page can make is the Turnstile
 * challenge. The copy says so, and it is worth keeping honest: "reading" rather than "uploading"
 * in the progress rows, and the privacy line under the drop zone.
 */
export function NewScreen() {
  const { draft } = useDraft(APP_NEW);
  const router = useRouter();
  const toast = useToast();

  const rows = useDraftStore((state) => state.rows);
  const parsing = useDraftStore((state) => state.parsing);
  const passwordFor = useDraftStore((state) => state.passwordFor);
  const addFiles = useDraftStore((state) => state.addFiles);
  const addPaste = useDraftStore((state) => state.addPaste);
  const removeRow = useDraftStore((state) => state.removeRow);
  const retryWithPassword = useDraftStore((state) => state.retryWithPassword);
  const dismissPasswordPrompt = useDraftStore((state) => state.dismissPasswordPrompt);
  const promptForPassword = useDraftStore((state) => state.promptForPassword);
  const setTurnstileToken = useDraftStore((state) => state.setTurnstileToken);

  const [paste, setPaste] = useState('');
  const [password, setPassword] = useState('');

  const handleFiles = useCallback((files: File[]) => void addFiles(files), [addFiles]);

  // Paste anywhere on the page, not only into the drop target. A screenshot on the clipboard is
  // one of the most common ways a student has their notes, and Cmd-V is how they expect to use it.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('textarea, input, [contenteditable]')) return;
      const files = [...(event.clipboardData?.files ?? [])];
      if (files.length) {
        event.preventDefault();
        void addFiles(files);
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [addFiles]);

  const items: UploadItem[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    size: row.size,
    kind: row.kind,
    state: row.state,
    ...(row.progress === undefined ? {} : { progress: row.progress }),
    ...(row.error ? { error: row.error } : {}),
    ...(row.code === 'encrypted' && row.file
      ? { action: { label: appStrings.new.passwordCta } }
      : {}),
  }));

  const blocks = draft?.doc.blocks ?? [];
  const scans = blocks.filter((block) => block.needsOCR).length;
  const chars = draft?.doc.meta.charCount ?? 0;
  const pages = draft?.doc.meta.pageCount ?? 0;
  const hasContent = blocks.length > 0;

  const goToReview = async () => {
    if (!draft) return;
    await flushDraft();
    router.push(reviewHref(draft.id));
  };

  return (
    <main className="mx-auto flex w-full max-w-[56rem] flex-col gap-8 px-5 py-10">
      <header>
        <h1 className="font-serif text-3xl font-semibold text-text">{appStrings.new.title}</h1>
        <p className="mt-2 max-w-prose font-sans text-text-muted">{appStrings.new.lead}</p>
      </header>

      <FileDropzone
        camera
        items={items}
        onFiles={handleFiles}
        onRemove={removeRow}
        onAction={promptForPassword}
      />

      <section className="flex flex-col gap-2">
        <Field label={appStrings.new.pasteLabel} hint={appStrings.new.pasteHint}>
          <Textarea
            prose
            rows={6}
            value={paste}
            placeholder={appStrings.new.pastePlaceholder}
            onChange={(event) => setPaste(event.target.value)}
          />
        </Field>
        <div>
          <Button
            size="sm"
            variant="secondary"
            disabled={!paste.trim()}
            onClick={() => {
              addPaste(paste);
              setPaste('');
              toast({ title: appStrings.new.pasteAdded });
            }}
          >
            {appStrings.new.pasteCta}
          </Button>
        </div>
      </section>

      <TurnstileWidget onToken={setTurnstileToken} />

      <div className="flex flex-col gap-3 border-t border-border pt-6">
        {/*
          `aria-live` so the summary is announced when a parse finishes. A student using a screen
          reader has no other signal that the file they dropped turned into anything.
        */}
        <p className="font-sans text-sm text-text-muted" aria-live="polite">
          {parsing
            ? appStrings.new.parsing
            : hasContent
              ? appStrings.new.readSummary(chars, pages, scans)
              : appStrings.new.emptyHint}
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            icon={<SparkIcon />}
            disabled={!hasContent || parsing}
            loading={parsing}
            onClick={() => void goToReview()}
          >
            {appStrings.new.reviewCta}
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href={APP_HOME}>Back to workspace</Link>
          </Button>
        </div>

        <p className="max-w-prose font-sans text-xs leading-snug text-text-muted">
          {appStrings.new.privacyNote}
        </p>
      </div>

      <Dialog
        open={Boolean(passwordFor)}
        onOpenChange={(open) => {
          if (!open) dismissPasswordPrompt();
        }}
      >
        <DialogContent
          title={appStrings.new.passwordTitle}
          description={appStrings.new.passwordBody}
        >
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!passwordFor) return;
              void retryWithPassword(passwordFor.id, password);
              setPassword('');
            }}
          >
            <Field label={appStrings.new.passwordLabel}>
              <Input
                type="password"
                autoComplete="off"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setPassword('');
                  dismissPasswordPrompt();
                }}
              >
                {appStrings.new.passwordCancel}
              </Button>
              <Button type="submit" icon={<ArrowDownIcon />} disabled={!password}>
                {appStrings.new.passwordCta}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
