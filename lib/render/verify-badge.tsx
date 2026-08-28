'use client';

import { AlertTriangleIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils/cn';
import type { FactCheckFlag } from '@/lib/ai/schema';

/**
 * "Double-check this" (06 §5.2). Appears on any section the model itself flagged as uncertain.
 *
 * The copy is deliberately not an apology and not a disclaimer — it names the specific claim and
 * says why it is shaky, because a badge that says "AI can make mistakes" teaches nothing and gets
 * tuned out by the second section.
 */
export function VerifyBadge({ flags, className }: { flags: FactCheckFlag[]; className?: string }) {
  if (flags.length === 0) return null;

  return (
    <details
      className={cn(
        'my-4 rounded-note border border-warning/50 bg-verify px-4 py-2.5 font-sans',
        className,
      )}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-text marker:hidden">
        <AlertTriangleIcon aria-hidden="true" className="text-base text-warning" />
        Double-check this
        <span className="text-text-muted">
          ({flags.length} {flags.length === 1 ? 'claim' : 'claims'})
        </span>
      </summary>
      <ul className="mt-2.5 flex flex-col gap-2.5">
        {flags.map((flag, index) => (
          <li key={index} className="text-sm leading-snug">
            <p className="text-text">“{flag.claim}”</p>
            <p className="text-text-muted">
              {flag.issue} <span className="text-text-faint">· {flag.confidence} confidence</span>
            </p>
          </li>
        ))}
      </ul>
    </details>
  );
}
