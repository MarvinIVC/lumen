'use client';

import { useTheme } from '@/lib/design/theme-provider';
import { THEMES } from '@/lib/design/theme';
import type { Theme } from '@/lib/design/theme';
import { cn } from '@/lib/utils/cn';

const LABELS: Record<Theme, string> = { light: 'Light', dark: 'Dark', system: 'System' };

/**
 * A plain segmented control over the theme.
 *
 * Written in phase-00 to prove the theme controller worked on the placeholder home page, and moved
 * here in phase-02 when that page became the marketing site — which deliberately carries no theme
 * toggle, because it follows the reader's device and every kilobyte of client JavaScript on `/` is
 * spoken for (02-ARCHITECTURE.md §8). Its home is Settings → Appearance, in phase-05.
 */
export function ThemeSwitcher() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md border border-border bg-bg-raised p-0.5"
      role="radiogroup"
      aria-label="Appearance"
    >
      {THEMES.map((option) => {
        const selected = theme === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(option)}
            className={cn(
              'rounded-sm px-3 py-1 text-sm transition-colors duration-(--dur-fast) ease-lumen',
              selected
                ? 'bg-accent-weak font-medium text-accent'
                : 'text-text-muted hover:text-text',
            )}
          >
            {LABELS[option]}
          </button>
        );
      })}
      <span className="sr-only" aria-live="polite">
        {theme === 'system' ? `Following your device: ${resolvedTheme}` : `${LABELS[theme]} theme`}
      </span>
    </div>
  );
}
