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
interface CalloutStyle {
  label: string;
  icon: ReactNode;
  surface: string;
  /** The glyph. Free to wear a marker colour — an icon is non-text UI, held to 3:1. */
  mark: string;
  /** The label words. Held to 4.5:1, which is why `warning` says them in ink. */
  text: string;
}

const KINDS: Record<CalloutKind, CalloutStyle> = {
  definition: {
    label: 'Definition',
    icon: <BookIcon />,
    surface: 'border-accent/40 bg-accent-weak',
    mark: 'text-accent',
    text: 'text-accent',
  },
  tip: {
    label: 'Tip',
    icon: <LightbulbIcon />,
    surface: 'border-accent/25 bg-accent-weak/50',
    mark: 'text-accent',
    text: 'text-accent',
  },
  warning: {
    label: 'Watch out',
    icon: <AlertTriangleIcon />,
    surface: 'border-warning/50 bg-verify',
    mark: 'text-warning',
    // --warning measures 3.72:1 in light: it may rule and mark, it may not spell out words.
    text: 'text-text',
  },
  example: {
    label: 'Example',
    icon: <QuoteIcon />,
    surface: 'border-border bg-bg-sunken',
    mark: 'text-text-muted',
    text: 'text-text-muted',
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
        className={cn('mb-1 flex items-center gap-1.5 font-sans text-xs font-semibold', kind.text)}
      >
        <span aria-hidden="true" className={cn('text-sm', kind.mark)}>
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
