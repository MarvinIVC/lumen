import { cn } from '@/lib/utils/cn';
import type { MisconceptionBlock } from '@/lib/ai/schema';

import { renderInline } from '../markdown/inline';

/**
 * A misconception is about the *subject* — a wrong idea lots of students hold — and is distinct
 * from a correction, which is about this student's own note (03-DESIGN.md §6).
 *
 * Two lines: the wrong idea quoted and struck, then the right one. The ✗/✓ glyphs are decorative;
 * the words "Not this" / "This" carry the meaning for a screen reader, because a struck-through
 * line is a visual convention that does not survive being read aloud.
 */
export function Misconception({
  block,
  className,
}: {
  block: MisconceptionBlock;
  className?: string;
}) {
  return (
    <div className={cn('my-5 flex flex-col gap-2 border-l-2 border-border pl-4', className)}>
      <p className="flex gap-2 leading-note">
        <span aria-hidden="true" className="font-sans text-danger">
          ✗
        </span>
        <span>
          <span className="sr-only">Not this: </span>
          <span className="text-text-muted line-through decoration-text-faint">
            {renderInline(block.wrong, 'wrong')}
          </span>
        </span>
      </p>
      <p className="flex gap-2 leading-note">
        <span aria-hidden="true" className="font-sans text-accent">
          ✓
        </span>
        <span>
          <span className="sr-only">This: </span>
          <span className="text-text">{renderInline(block.right, 'right')}</span>
        </span>
      </p>
    </div>
  );
}
