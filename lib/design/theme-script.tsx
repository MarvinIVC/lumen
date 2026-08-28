import { DEFAULT_THEME, THEME_STORAGE_KEY, THEMES } from './theme';

/**
 * A tiny blocking script for <head>. It applies the persisted theme *before* first paint, so
 * there is no light-then-dark flash and no layout shift (03-DESIGN.md §2, 02-ARCHITECTURE.md §8).
 *
 * It must stay dependency-free and synchronous. `applyTheme()` in ./theme.ts does the same thing
 * for the React runtime; this is the pre-hydration twin.
 */
const script = `(function(){try{
var k=${JSON.stringify(THEME_STORAGE_KEY)},d=${JSON.stringify(DEFAULT_THEME)},a=${JSON.stringify(THEMES)};
var t=localStorage.getItem(k);if(a.indexOf(t)===-1)t=d;
var e=document.documentElement;
if(t==='system')e.removeAttribute('data-theme');else e.setAttribute('data-theme',t);
}catch(_){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} suppressHydrationWarning />;
}
