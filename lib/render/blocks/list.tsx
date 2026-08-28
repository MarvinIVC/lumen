import { cn } from '@/lib/utils/cn';
import type { ListBlock } from '@/lib/ai/schema';

import { renderInline } from '../markdown/inline';

/** Markers in the UI sans so they stay quiet next to serif body copy. */
export function List({ block, className }: { block: ListBlock; className?: string }) {
  const Component = block.ordered ? 'ol' : 'ul';

  return (
    <Component
      className={cn(
        'my-4 flex flex-col gap-2 pl-5 marker:font-sans marker:text-text-muted',
        block.ordered ? 'list-decimal' : 'list-disc',
        className,
      )}
    >
      {block.items.map((item, index) => (
        <li key={index} className="leading-note">
          {renderInline(item, `li-${index}`)}
        </li>
      ))}
    </Component>
  );
}
