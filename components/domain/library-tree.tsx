'use client';

import { useState } from 'react';

import { BookIcon, ChevronRightIcon, FlaskIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils/cn';

export interface LibraryNode {
  id: string;
  label: string;
  kind?: 'subject' | 'course' | 'unit' | 'note';
  count?: number;
  color?: string | null;
  children?: LibraryNode[];
}

export interface LibraryTreeProps {
  nodes: LibraryNode[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  onDropNote?: (noteId: string, unitId: string) => void;
  ariaLabel?: string;
  className?: string;
}

/**
 * Course → unit → note, in the sidebar (03-DESIGN.md §5).
 *
 * A real `tree`/`treeitem` structure rather than nested lists of links: a student with fifteen
 * units wants to skip a whole course with one key, and that only works if the assistive tech
 * knows this is a tree. Phase-06 wires it to the store; the shape is settled here.
 */
export function LibraryTree({
  nodes,
  selectedId,
  onSelect,
  onDropNote,
  ariaLabel = 'Your library',
  className,
}: LibraryTreeProps) {
  return (
    <ul role="tree" aria-label={ariaLabel} className={cn('font-sans text-sm', className)}>
      {nodes.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
          onDropNote={onDropNote}
        />
      ))}
    </ul>
  );
}

function TreeNode({
  node,
  depth,
  selectedId,
  onSelect,
  onDropNote,
}: {
  node: LibraryNode;
  depth: number;
  selectedId?: string;
  onSelect?: (id: string) => void;
  onDropNote?: (noteId: string, unitId: string) => void;
}) {
  const [open, setOpen] = useState(depth === 0);
  const hasChildren = Boolean(node.children?.length);
  const selected = node.id === selectedId;

  return (
    <li role="none">
      <div
        role="treeitem"
        aria-selected={selected}
        aria-expanded={hasChildren ? open : undefined}
        tabIndex={selected ? 0 : -1}
        onDragOver={(event) => {
          if (node.kind === 'unit') event.preventDefault();
        }}
        onDrop={(event) => {
          if (node.kind !== 'unit') return;
          event.preventDefault();
          const noteId = event.dataTransfer.getData('application/x-lumen-note');
          if (noteId) onDropNote?.(noteId, node.id.replace(/^unit:/, ''));
        }}
        onClick={() => {
          if (hasChildren) setOpen((value) => !value);
          onSelect?.(node.id);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (hasChildren) setOpen((value) => !value);
            onSelect?.(node.id);
          }
          if (event.key === 'ArrowRight' && hasChildren) setOpen(true);
          if (event.key === 'ArrowLeft' && hasChildren) setOpen(false);
        }}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        className={cn(
          'flex cursor-pointer items-center gap-1.5 rounded-sm py-1.5 pr-2',
          'transition-colors duration-(--dur-fast) ease-lumen',
          selected ? 'bg-accent-weak font-medium text-accent' : 'text-text-muted hover:text-text',
        )}
      >
        {hasChildren ? (
          <ChevronRightIcon
            aria-hidden="true"
            className={cn(
              'shrink-0 text-sm transition-transform duration-(--dur-fast) ease-lumen',
              open && 'rotate-90',
            )}
          />
        ) : (
          <span aria-hidden="true" className="shrink-0 text-sm">
            {node.kind === 'subject' ? <FlaskIcon /> : <BookIcon />}
          </span>
        )}
        <span className="flex-1 truncate">{node.label}</span>
        {node.count !== undefined ? (
          <span className="shrink-0 text-xs text-text-muted tabular-nums">{node.count}</span>
        ) : null}
      </div>

      {hasChildren && open ? (
        <ul role="group">
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onDropNote={onDropNote}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
