'use client';

/**
 * The single source of resolved token values for everything that cannot read a CSS variable
 * (03-DESIGN.md §9): Mermaid's `themeVariables`, smiles-drawer's theme object, the hand-rolled SVG
 * charts, and the KaTeX color override.
 *
 * Why a hook and not the literals in tokens.ts: those literals are per-theme *definitions*, while
 * a renderer needs the value that is live in the document right now. This reads the computed
 * value off `<html>` and re-reads whenever the theme changes — by the `data-theme` attribute (the
 * toggle) or by the OS preference (the `system` setting). `themeVersion` increments on each
 * change so callers can put it in an effect's dependency list and re-render their diagram.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { readTokens } from './tokens';
import type { TokenName } from './tokens';
import type { ResolvedTheme } from './theme';

/**
 * Every token a third-party renderer may need. Deliberately explicit: adding one here is the
 * moment to ask whether the renderer should be using a token it does not already have.
 */
export const RENDERER_TOKENS = [
  '--bg',
  '--bg-raised',
  '--bg-sunken',
  '--border',
  '--border-strong',
  '--text',
  '--text-muted',
  '--text-faint',
  '--accent',
  '--accent-hover',
  '--accent-weak',
  '--link',
  '--success',
  '--warning',
  '--danger',
  '--font-sans',
  '--font-serif',
  '--font-mono',
] as const satisfies readonly TokenName[];

export type RendererToken = (typeof RENDERER_TOKENS)[number];
export type ThemeTokens = Record<RendererToken, string>;

export interface UseThemeTokens {
  /** Resolved values for the document's current theme. Empty strings before hydration. */
  tokens: ThemeTokens;
  /** What the document is actually showing, regardless of how it was chosen. */
  resolvedTheme: ResolvedTheme;
  /**
   * Increments on every theme change. Put it in the dependency array of the effect that renders
   * a Mermaid diagram or a SMILES structure and the re-render on theme flip is automatic.
   */
  themeVersion: number;
}

const EMPTY_TOKENS = Object.fromEntries(RENDERER_TOKENS.map((name) => [name, ''])) as ThemeTokens;

/**
 * Notifies on anything that can change resolved token values: the `data-theme` attribute
 * flipping, and the OS preference changing while the app follows `system`.
 */
function subscribeToThemeChanges(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  const query = window.matchMedia?.('(prefers-color-scheme: dark)');
  query?.addEventListener('change', onChange);

  return () => {
    observer.disconnect();
    query?.removeEventListener('change', onChange);
  };
}

/** Reads the theme the document is currently painting, not the user's stored preference. */
function readResolvedTheme(): ResolvedTheme {
  if (typeof document === 'undefined') return 'light';
  const pinned = document.documentElement.getAttribute('data-theme');
  if (pinned === 'dark' || pinned === 'light') return pinned;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useThemeTokens(): UseThemeTokens {
  const [themeVersion, setThemeVersion] = useState(0);

  const subscribe = useCallback((onStoreChange: () => void) => {
    return subscribeToThemeChanges(onStoreChange);
  }, []);

  const resolvedTheme = useSyncExternalStore(
    subscribe,
    readResolvedTheme,
    () => 'light' as ResolvedTheme,
  );

  const [tokens, setTokens] = useState<ThemeTokens>(EMPTY_TOKENS);

  // Values can only be read once the stylesheet is live, so this is an effect rather than a memo.
  // Bumping the counter here is what lets a diagram depend on "the theme changed" without having
  // to diff nineteen color strings itself.
  useEffect(() => {
    setTokens(readTokens(RENDERER_TOKENS));
    setThemeVersion((version) => version + 1);
  }, [resolvedTheme]);

  return { tokens, resolvedTheme, themeVersion };
}
