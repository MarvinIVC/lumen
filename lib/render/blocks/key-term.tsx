import { cn } from '@/lib/utils/cn';
import type { DefinitionBlock } from '@/lib/ai/schema';

import { renderInline } from '../markdown/inline';

/**
 * A key term (03-DESIGN.md §6). The term is set in the UI sans and the definition in the note
 * serif — the change of voice is what makes it read as a *labelled* thing rather than a bolded
 * sentence. Quiet sunken panel, 4px accent rule, square-ish corners: bookish, not a card.
 *
 * `<dl>` rather than a div because that is what this is, and because it gives a screen reader the
 * term/definition pairing for free.
 */
export function KeyTerm({ block, className }: { block: DefinitionBlock; className?: string }) {
  return (
    <dl
      className={cn(
        'my-4 rounded-r-note border-l-4 border-accent bg-bg-sunken py-3 pr-4 pl-4',
        className,
      )}
    >
      <dt className="font-sans text-sm font-semibold text-text">
        {block.term}
        <span aria-hidden="true">:</span>
        {block.aliases?.length ? (
          <span className="ml-2 font-normal text-text-muted">also {block.aliases.join(', ')}</span>
        ) : null}
      </dt>
      <dd className="mt-1 leading-note text-text">{renderInline(block.definition, block.term)}</dd>
    </dl>
  );
}
