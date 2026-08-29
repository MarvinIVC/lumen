'use client';

import { useCallback, useRef, useState } from 'react';
import type { DragEvent } from 'react';

import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Progress } from '@/components/ui/progress';
import {
  AlertTriangleIcon,
  CheckIcon,
  FileIcon,
  ImageIcon,
  UploadIcon,
  XIcon,
} from '@/components/ui/icons';
import { cn } from '@/lib/utils/cn';

export type UploadState = 'queued' | 'reading' | 'done' | 'error';

export interface UploadItem {
  id: string;
  name: string;
  /** Bytes. Formatted here so every caller shows the same units. */
  size: number;
  kind: 'document' | 'image';
  state: UploadState;
  /** 0–100 while `reading`. */
  progress?: number;
  /** What went wrong, in the voice of 01-PRODUCT.md §6: what happened, and what to do next. */
  error?: string;
}

export interface FileDropzoneProps {
  items: UploadItem[];
  onFiles: (files: File[]) => void;
  onRemove?: (id: string) => void;
  accept?: string;
  className?: string;
}

const ACCEPT = '.docx,.pdf,.md,.txt,.png,.jpg,.jpeg,.heic';

/**
 * Where a note begins (03-DESIGN.md §5). Drag, paste, browse, or a photo of the whiteboard.
 *
 * Parsing is local (06 §6), so this never uploads anything — the per-file rows report *reading*
 * progress. That distinction is worth keeping in the copy: "reading" is true and "uploading" is
 * not, and the privacy promise is only as good as the smallest wording in the product.
 *
 * The drop target is a label wrapping a real file input rather than a div with handlers, so it is
 * keyboard-operable and announced without any ARIA at all.
 */
export function FileDropzone({
  items,
  onFiles,
  onRemove,
  accept = ACCEPT,
  className,
}: FileDropzoneProps) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      setDragging(false);
      const files = [...event.dataTransfer.files];
      if (files.length) onFiles(files);
    },
    [onFiles],
  );

  return (
    <div className={cn('flex flex-col gap-3 font-sans', className)}>
      <label
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onPaste={(event) => {
          const files = [...event.clipboardData.files];
          if (files.length) onFiles(files);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed',
          'px-6 py-10 text-center transition-colors duration-(--dur-fast) ease-lumen',
          'focus-within:border-accent hover:border-border-strong hover:bg-bg-sunken',
          dragging ? 'border-accent bg-accent-weak' : 'border-border',
        )}
      >
        <span aria-hidden="true" className="text-3xl text-text-faint">
          <UploadIcon />
        </span>
        <span className="flex flex-col gap-1">
          <span className="text-md font-medium text-text">Drop the notes you already have</span>
          <span className="text-sm text-text-muted">
            Word, PDF, Markdown, or a photo of the whiteboard. Paste works too.
          </span>
        </span>
        <Button asChild size="sm">
          {/* The label already opens the picker; this is the affordance, not a second control. */}
          <span>Browse files</span>
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          accept={accept}
          className="sr-only"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            if (files.length) onFiles(files);
            // Let the same file be chosen twice in a row.
            event.target.value = '';
          }}
        />
      </label>

      {items.length ? (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-md border border-border bg-bg-raised px-3 py-2.5"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'text-base',
                  item.state === 'error' ? 'text-danger' : 'text-text-muted',
                )}
              >
                {item.kind === 'image' ? <ImageIcon /> : <FileIcon />}
              </span>

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-sm text-text">{item.name}</p>
                  <p className="shrink-0 text-xs text-text-muted tabular-nums">
                    {formatSize(item.size)}
                  </p>
                </div>

                {item.state === 'reading' ? (
                  <Progress
                    value={item.progress}
                    label={`Reading ${item.name}`}
                    className="mt-0.5"
                  />
                ) : null}
                {item.state === 'error' && item.error ? (
                  <p className="text-xs leading-snug text-danger">{item.error}</p>
                ) : null}
              </div>

              {item.state === 'done' ? (
                <CheckIcon aria-label="Read" className="shrink-0 text-base text-success" />
              ) : null}
              {item.state === 'error' ? (
                <AlertTriangleIcon
                  aria-label="Could not read"
                  className="shrink-0 text-base text-danger"
                />
              ) : null}
              {onRemove ? (
                <IconButton
                  size="sm"
                  label={`Remove ${item.name}`}
                  icon={<XIcon />}
                  onClick={() => onRemove(item.id)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
