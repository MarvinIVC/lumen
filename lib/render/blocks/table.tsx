'use client';

import { useRef } from 'react';

import { cn } from '@/lib/utils/cn';
import type { TableBlock } from '@/lib/ai/schema';

import { renderInline } from '../markdown/inline';
import { useScrollableRegion } from '../use-overflow';

/**
 * Hairline rules, no zebra, no vertical borders, numeric columns right-aligned, generous padding,
 * caption above (03-DESIGN.md §6). This is the table shape of a well-set textbook, and every part
 * of it is a subtraction from what a default table gives you.
 *
 * The wrapper scrolls rather than the page: a wide comparison table on a phone must not make the
 * whole document scroll sideways.
 */
export function Table({ block, className }: { block: TableBlock; className?: string }) {
  const rowHeaders = block.columns[0]?.header === '';
  const scroller = useRef<HTMLDivElement>(null);
  useScrollableRegion(scroller, block.caption || 'Table');

  return (
    <div className={cn('my-6', className)}>
      <div ref={scroller} className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          {block.caption ? (
            <caption className="mb-3 caption-top text-left font-sans text-sm text-text-muted">
              {renderInline(block.caption, 'table-caption')}
            </caption>
          ) : null}
          <thead>
            <tr className="border-b border-border-strong">
              {block.columns.map((column, index) => {
                const headerClass = cn(
                  'px-3 py-2 font-sans text-xs font-semibold tracking-wide text-text-muted uppercase',
                  column.numeric && 'text-right',
                );
                // A comparison table's top-left corner is genuinely empty. An empty <th> claims to
                // label a column and labels nothing, so the corner is a <td> — which is also what
                // makes the first column safe to promote to row headers below.
                return column.header ? (
                  <th key={index} scope="col" className={headerClass}>
                    {column.header}
                  </th>
                ) : (
                  <td key={index} className={headerClass} />
                );
              })}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-border last:border-0">
                {row.map((cell, cellIndex) => {
                  const cellClass = cn(
                    'px-3 py-2.5 align-top leading-snug',
                    block.columns[cellIndex]?.numeric && 'text-right',
                  );
                  // With no column heading above it, the first column *is* the row's label —
                  // "Made of", "Smallest unit". Marking it up as such is what lets a screen
                  // reader say "Smallest unit, ionic compounds: a formula unit" instead of
                  // reading a bare cell adrift from both its axes.
                  return rowHeaders && cellIndex === 0 ? (
                    <th key={cellIndex} scope="row" className={cn(cellClass, 'font-medium')}>
                      {renderInline(cell, `cell-${rowIndex}-${cellIndex}`)}
                    </th>
                  ) : (
                    <td key={cellIndex} className={cellClass}>
                      {renderInline(cell, `cell-${rowIndex}-${cellIndex}`)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
