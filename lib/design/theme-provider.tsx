'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import {
  DEFAULT_THEME,
  applyTheme,
  getStoredTheme,
  resolveTheme,
  storeTheme,
  watchSystemTheme,
} from './theme';
import type { ResolvedTheme, Theme } from './theme';

interface ThemeContextValue {
  /** What the user chose: 'light' | 'dark' | 'system'. */
  theme: Theme;
  /** What that currently means on this device. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Start at the default so server and client markup agree; `ThemeScript` has already put the
  // real value on <html>, and the effect below syncs React's copy on mount.
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);
  const [resolved, setResolved] = useState<ResolvedTheme>('light');

  useEffect(() => {
    const stored = getStoredTheme();
    setThemeState(stored);
    setResolved(resolveTheme(stored));
  }, []);

  useEffect(() => {
    // Only 'system' cares about OS changes; 'light'/'dark' are pinned.
    return watchSystemTheme((next) => {
      setResolved((current) => (getStoredTheme() === 'system' ? next : current));
    });
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    setResolved(resolveTheme(next));
    applyTheme(next);
    storeTheme(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme: resolved, setTheme }),
    [theme, resolved, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>');
  return context;
}
