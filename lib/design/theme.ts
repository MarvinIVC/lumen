/**
 * Theme controller (03-DESIGN.md §2).
 *
 * Three states, persisted in localStorage:
 *   'light'  → `data-theme="light"` on <html>. Wins over a dark OS preference.
 *   'dark'   → `data-theme="dark"`  on <html>. Wins over a light OS preference.
 *   'system' → the attribute is REMOVED, so `@media (prefers-color-scheme: dark)` decides.
 *
 * The attribute-removal is the whole trick: tokens.css guards its media block with
 * `:root:not([data-theme='light'])`, so an absent attribute means "follow the OS".
 */

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEMES = ['light', 'dark', 'system'] as const;
export const DEFAULT_THEME: Theme = 'system';

/** Also hard-coded in `theme-script.tsx`; change both together. */
export const THEME_STORAGE_KEY = 'lumen.theme';

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

/** Reads the persisted choice. Falls back to 'system' in SSR, private mode, or on junk values. */
export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function storeTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage denied (private mode, blocked cookies) — the theme still applies for this page.
  }
}

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === 'system' ? getSystemTheme() : theme;
}

/** Writes (or clears) `data-theme` on <html>. Safe to call repeatedly. */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

/** Subscribes to OS theme changes. Returns an unsubscribe function. */
export function watchSystemTheme(onChange: (theme: ResolvedTheme) => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (event: MediaQueryListEvent) => onChange(event.matches ? 'dark' : 'light');
  query.addEventListener('change', handler);
  return () => query.removeEventListener('change', handler);
}
