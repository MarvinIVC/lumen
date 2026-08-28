import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

import { renderInline } from '../markdown/inline';

export interface FigureWithCaptionProps {
  /** Sequential within the document — assigned by the renderer, not by the model. */
  number: number;
  caption: string;
  children: ReactNode;
  /** Marks values as illustrative rather than measured (06 §1). */
  illustrative?: boolean;
  className?: string;
}

/**
 * The shared shell for anything with a numbered caption: diagrams, charts, structures, images.
 *
 * Numbering is the renderer's job. Letting the model write "Figure 1.2" into the caption text is
 * how a document ends up with two Figure 3s after an edit.
 */
export function FigureWithCaption({
  number,
  caption,
  children,
  illustrative = false,
  className,
}: FigureWithCaptionProps) {
  return (
    <figure className={cn('my-6 flex flex-col items-center gap-3', className)}>
      <div className="flex w-full justify-center overflow-x-auto">{children}</div>
      <figcaption className="max-w-prose text-center font-sans text-sm leading-snug text-text-muted">
        <span className="font-medium text-text">Figure {number}.</span>{' '}
        {renderInline(caption, `fig-${number}`)}
        {illustrative ? <span className="text-text-muted"> Values are illustrative.</span> : null}
      </figcaption>
    </figure>
  );
}
