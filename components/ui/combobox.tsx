'use client';

import { useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

import { ChevronUpDownIcon } from './icons';
import { controlSurface, useFieldControl } from './field';
import { overlaySurface } from './surfaces';
import { matches, useListNavigation } from './use-list-navigation';

export interface ComboboxOption {
  value: string;
  label: string;
  /** A second line — the curriculum a course belongs to, the unit a topic sits in. */
  detail?: string;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value: string | null;
  onValueChange: (value: string) => void;
  placeholder?: string;
  /** Shown when nothing matches. Should suggest what to do, not just say "no results". */
  emptyMessage?: ReactNode;
  /** Lets the typed text be committed as-is — for "my school's own course name". */
  allowCustomValue?: boolean;
  'aria-label'?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Type-to-filter single select. Radix has no combobox, and this is the ARIA 1.2 pattern:
 * `role="combobox"` on the input, focus never leaves it, the active row is pointed at with
 * `aria-activedescendant`.
 */
export function Combobox({
  options,
  value,
  onValueChange,
  placeholder,
  emptyMessage = 'Nothing matches. Try fewer words.',
  allowCustomValue = false,
  className,
  disabled,
  ...aria
}: ComboboxProps) {
  const field = useFieldControl();
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = options.find((option) => option.value === value) ?? null;
  const filtered = useMemo(
    () => options.filter((option) => matches(`${option.label} ${option.detail ?? ''}`, query)),
    [options, query],
  );

  const commit = (index: number) => {
    const option = filtered[index];
    if (option) {
      onValueChange(option.value);
      setQuery('');
      setOpen(false);
      return;
    }
    if (allowCustomValue && query.trim()) {
      onValueChange(query.trim());
      setQuery('');
      setOpen(false);
    }
  };

  const nav = useListNavigation({
    itemCount: filtered.length,
    onCommit: commit,
    onDismiss: () => setOpen(false),
    resetKey: query,
  });

  const activeId = filtered.length ? `${baseId}-option-${nav.activeIndex}` : undefined;

  return (
    <div className={cn('relative', className)}>
      <div className="relative flex items-center">
        <input
          {...field}
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={open ? activeId : undefined}
          aria-label={aria['aria-label']}
          disabled={disabled}
          value={open ? query : (selected?.label ?? '')}
          placeholder={selected ? selected.label : placeholder}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          // A click outside should close it, but only after any click on a row has run.
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(event) => {
            if (!open && (event.key === 'ArrowDown' || event.key === 'Enter')) {
              setOpen(true);
              event.preventDefault();
              return;
            }
            nav.onKeyDown(event);
          }}
          className={cn(controlSurface, 'h-10 px-3 pr-9 text-sm')}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-3 text-base text-text-muted"
        >
          <ChevronUpDownIcon />
        </span>
      </div>

      {open ? (
        <div
          ref={nav.listRef}
          id={listboxId}
          role="listbox"
          className={cn(overlaySurface, 'absolute z-50 mt-1 max-h-64 w-full overflow-y-auto p-1')}
        >
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-sm text-text-muted">{emptyMessage}</p>
          ) : (
            filtered.map((option, index) => (
              <div
                key={option.value}
                id={`${baseId}-option-${index}`}
                role="option"
                // Selection is driven by aria-activedescendant, so options stay out of the tab
                // order; -1 keeps them programmatically focusable for assistive tech.
                tabIndex={-1}
                aria-selected={option.value === value}
                data-active={index === nav.activeIndex}
                onMouseEnter={() => nav.setActiveIndex(index)}
                onMouseDown={(event) => {
                  // Commit before the input's blur can close the list under the pointer.
                  event.preventDefault();
                  commit(index);
                }}
                className={cn(
                  'flex cursor-default flex-col gap-0.5 rounded-sm px-2 py-1.5 text-sm',
                  index === nav.activeIndex ? 'bg-bg-sunken text-text' : 'text-text',
                  option.value === value && 'font-medium',
                )}
              >
                <span>{option.label}</span>
                {option.detail ? (
                  <span className="text-xs text-text-muted">{option.detail}</span>
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
