import type { ReactNode } from 'react';

import { AlertTriangleIcon, BookIcon, LightbulbIcon, QuoteIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils/cn';
import type { CalloutBlock, CalloutKind } from '@/lib/ai/schema';

import { renderInline } from '../markdown/inline';

/**
 * Four kinds, and no fifth (03-DESIGN.md §6). The restraint is the design: a note with a callout
 * every other paragraph has taught the reader to skip them.
 *
 * Corners are 4px rather than the UI's 10px — inside the note, boxes should look printed.
 */
const KINDS: Record<
  CalloutKind,
  { label: string; icon: ReactNode; surface: string; mark: string }
> = {
  definition: {
    label: 'Definition',
    icon: <BookIcon />,
    surface: 'border-accent/40 bg-accent-weak',
    mark: 'text-accent',
  },
  tip: {
    label: 'Tip',
    icon: <LightbulbIcon />,
    surface: 'border-accent/25 bg-accent-weak/50',
    mark: 'text-accent',
  },
  warning: {
    label: 'Watch out',
    icon: <AlertTriangleIcon />,
    // --warning is a marker token; it rules and marks, the words stay ink.
    surface: 'border-warning/50 bg-verify',
    mark: 'text-warning',
  },
  example: {
    label: 'Example',
    icon: <QuoteIcon />,
    surface: 'border-border bg-bg-sunken',
    mark: 'text-text-muted',
  },
};

export function Callout({ block, className }: { block: CalloutBlock; className?: string }) {
  const kind = KINDS[block.kind];

  return (
    <aside
      className={cn('my-5 rounded-note border px-4 py-3', kind.surface, className)}
      aria-label={block.title ?? kind.label}
    >
      <p
        className={cn('mb-1 flex items-center gap-1.5 font-sans text-xs font-semibold', kind.mark)}
      >
        <span aria-hidden="true" className="text-sm">
          {kind.icon}
        </span>
        <span className="tracking-wider uppercase">{block.title ?? kind.label}</span>
      </p>
      <div className="leading-note text-text">
        {renderInline(block.text, `callout-${block.kind}`)}
      </div>
    </aside>
  );
}
