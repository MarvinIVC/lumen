'use client';

import { Dialog as RadixDialog, VisuallyHidden } from 'radix-ui';
import { useEffect, useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

import { SearchIcon } from './icons';
import { dialogSurface, scrim } from './surfaces';
import { matches, useListNavigation } from './use-list-navigation';

export interface CommandItem {
  id: string;
  label: string;
  /** Extra words that should match but not be shown — "new", "create", "upload". */
  keywords?: string;
  group: string;
  icon?: ReactNode;
  shortcut?: string;
  onSelect: () => void;
}

export interface CommandMenuProps {
  items: CommandItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placeholder?: string;
  emptyMessage?: ReactNode;
}

/**
 * ⌘K (03-DESIGN.md §5). A dialog for the focus trap and the scrim, and the same
 * `aria-activedescendant` listbox model as `Combobox` — arrows move the selection, focus stays in
 * the input, Enter runs the command.
 */
export function CommandMenu({
  items,
  open,
  onOpenChange,
  placeholder = 'Search notes and actions…',
  emptyMessage = 'No matches. Try a shorter word.',
}: CommandMenuProps) {
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const filtered = useMemo(
    () => items.filter((item) => matches(`${item.label} ${item.keywords ?? ''}`, query)),
    [items, query],
  );

  // Groups keep their first-appearance order, so the menu does not reshuffle as you type.
  const groups = useMemo(() => {
    const byGroup = new Map<string, { item: CommandItem; index: number }[]>();
    filtered.forEach((item, index) => {
      const bucket = byGroup.get(item.group) ?? [];
      bucket.push({ item, index });
      byGroup.set(item.group, bucket);
    });
    return [...byGroup.entries()];
  }, [filtered]);

  const nav = useListNavigation({
    itemCount: filtered.length,
    onCommit: (index) => {
      const item = filtered[index];
      if (!item) return;
      onOpenChange(false);
      item.onSelect();
    },
    onDismiss: () => onOpenChange(false),
    resetKey: query,
  });

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={cn(scrim, 'overlay-motion')} />
        <RadixDialog.Content
          aria-label="Command menu"
          className={cn(
            dialogSurface,
            'fixed top-[15vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-lg popover-motion',
            '-translate-x-1/2 overflow-hidden p-0',
          )}
        >
          <VisuallyHidden.Root>
            <RadixDialog.Title>Command menu</RadixDialog.Title>
            <RadixDialog.Description>
              Search your notes and run an action. Use the arrow keys to move, Enter to choose.
            </RadixDialog.Description>
          </VisuallyHidden.Root>

          <div className="flex items-center gap-2.5 border-b border-border px-4">
            <SearchIcon className="text-base text-text-faint" />
            {/* Radix moves focus to the first focusable child on open — that is this input. */}
            <input
              role="combobox"
              aria-expanded
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={
                filtered.length ? `${baseId}-option-${nav.activeIndex}` : undefined
              }
              aria-label={placeholder}
              value={query}
              placeholder={placeholder}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={nav.onKeyDown}
              className={cn(
                'h-12 w-full bg-transparent text-sm text-text outline-none',
                'placeholder:text-text-muted',
              )}
            />
          </div>

          <div
            ref={nav.listRef}
            id={listboxId}
            role="listbox"
            aria-label="Results"
            className="max-h-80 overflow-y-auto p-1.5"
          >
            {filtered.length === 0 ? (
              <p className="px-2.5 py-6 text-center text-sm text-text-muted">{emptyMessage}</p>
            ) : (
              groups.map(([group, entries]) => (
                <div key={group} role="group" aria-label={group}>
                  <p className="px-2.5 pt-2 pb-1 text-xs font-medium tracking-wide text-text-muted">
                    {group}
                  </p>
                  {entries.map(({ item, index }) => (
                    <div
                      key={item.id}
                      id={`${baseId}-option-${index}`}
                      role="option"
                      // Selection is driven by aria-activedescendant, so options stay out of
                      // the tab order; -1 keeps them reachable programmatically.
                      tabIndex={-1}
                      aria-selected={index === nav.activeIndex}
                      data-active={index === nav.activeIndex}
                      onMouseEnter={() => nav.setActiveIndex(index)}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        onOpenChange(false);
                        item.onSelect();
                      }}
                      className={cn(
                        'flex cursor-default items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm',
                        index === nav.activeIndex ? 'bg-bg-sunken text-text' : 'text-text',
                      )}
                    >
                      {item.icon ? (
                        <span aria-hidden="true" className="text-base text-text-muted">
                          {item.icon}
                        </span>
                      ) : null}
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.shortcut ? (
                        <span className="text-xs tracking-wide text-text-muted">
                          {item.shortcut}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/**
 * Binds ⌘K / Ctrl-K. Kept separate from the menu so a page can also open it from a button, and so
 * the shortcut can be registered exactly once at the app shell.
 */
export function useCommandMenuShortcut(onOpen: () => void): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onOpen();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onOpen]);
}
