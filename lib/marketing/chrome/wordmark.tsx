import { APP_NAME } from '@/lib/config';
import { cn } from '@/lib/utils/cn';

/**
 * The wordmark: the product's name set in the note serif, with one accent dot.
 *
 * There is no logo file and no illustration, because 03-DESIGN.md §8 is explicit that the product
 * UI is the imagery. A mark drawn in type also means the name really is a one-line change — a
 * rename that leaves a stale SVG behind is the usual way `APP_NAME` stops being the single source.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-serif text-lg font-semibold tracking-tight text-text', className)}>
      {APP_NAME}
      <span aria-hidden="true" className="text-accent">
        .
      </span>
    </span>
  );
}
