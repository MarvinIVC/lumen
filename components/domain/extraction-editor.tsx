'use client';

import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils/cn';

export interface ExtractedPage {
  /** Page or slide number from the source file, or a photo index. */
  marker: string;
  text: string;
  /** OCR confidence, 0–1. Absent for text that was parsed rather than recognised. */
  confidence?: number;
}

export interface ExtractionEditorProps {
  fileName: string;
  pages: ExtractedPage[];
  onChange?: (index: number, text: string) => void;
  readOnly?: boolean;
  className?: string;
}

/**
 * The review screen's left pane (03-DESIGN.md §5) — what we read out of the file, lightly
 * editable, with the page markers kept.
 *
 * Shell only; phase-03 owns the parsers and the real editing model. What matters here is the
 * shape: page markers stay visible, and a low-confidence OCR page says so *before* the student
 * spends a daily credit on text that was never right.
 */
export function ExtractionEditor({
  fileName,
  pages,
  onChange,
  readOnly = false,
  className,
}: ExtractionEditorProps) {
  return (
    <div
      role="group"
      aria-label={`Extracted text from ${fileName}`}
      className={cn('flex flex-col gap-4', className)}
    >
      <div className="flex items-baseline justify-between gap-3 font-sans">
        <p className="truncate text-sm font-medium text-text">{fileName}</p>
        <p className="shrink-0 text-xs text-text-muted">
          {pages.length} {pages.length === 1 ? 'page' : 'pages'}
        </p>
      </div>

      {pages.map((page, index) => {
        const shaky = page.confidence !== undefined && page.confidence < 0.8;
        return (
          <div key={page.marker} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 font-sans">
              <span className="text-xs font-medium tracking-wide text-text-muted uppercase">
                {page.marker}
              </span>
              {shaky ? <Badge tone="warning">Hard to read — check this page</Badge> : null}
            </div>
            <Textarea
              prose
              rows={Math.min(14, Math.max(4, Math.ceil(page.text.length / 90)))}
              aria-label={`${page.marker} of ${fileName}`}
              defaultValue={page.text}
              readOnly={readOnly}
              onChange={(event) => onChange?.(index, event.target.value)}
              className={cn(shaky && 'border-warning/60')}
            />
          </div>
        );
      })}
    </div>
  );
}
