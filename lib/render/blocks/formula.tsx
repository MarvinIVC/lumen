import { cn } from '@/lib/utils/cn';
import type { FormulaBlock } from '@/lib/ai/schema';

import { MathBlock } from '../math/math-block';
import { renderInline } from '../markdown/inline';

/**
 * A formula is three parts, always (04-AI-ENGINE.md rubric item 2, 03-DESIGN.md §6): the equation,
 * a "where:" list giving every symbol a meaning *and a unit*, and one line saying when to reach
 * for it. The units are the part students are actually missing, so they are not optional here —
 * the schema requires them and this renders them in their own column.
 */
export function Formula({ block, className }: { block: FormulaBlock; className?: string }) {
  return (
    <div className={cn('my-6 flex flex-col gap-3', className)}>
      <MathBlock latex={block.latex} number={block.number} />

      {block.where.length || block.useWhen ? (
        <div className="border-l-2 border-border pl-4 font-sans text-sm">
          {block.where.length ? <p className="mb-1.5 text-text-muted">where:</p> : null}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            {block.where.map((variable) => (
              <div key={variable.symbol} className="contents">
                <dt className="text-right font-medium text-text">
                  {renderInline(`$${variable.symbol}$`, `sym-${variable.symbol}`)}
                </dt>
                <dd className="text-text-muted">
                  {variable.meaning}
                  <span className="text-text-faint"> · </span>
                  <span className="font-mono text-xs">{variable.units}</span>
                </dd>
              </div>
            ))}
          </dl>
          {block.useWhen ? (
            <p className={cn(block.where.length && 'mt-2', 'text-text-muted')}>
              <span className="font-medium text-text">Use when:</span>{' '}
              {renderInline(block.useWhen, 'use-when')}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
