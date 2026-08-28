import * as React from 'react';
import type { Decorator, Preview } from '@storybook/nextjs-vite';

import { fontVariables } from '../lib/design/fonts';
import { ThemeProvider } from '../lib/design/theme-provider';
import '../app/globals.css';

/**
 * The toolbar theme switch drives the *same* mechanism the app uses (lib/design/theme.ts):
 * `light`/`dark` pin `data-theme` on <html>, `system` removes it so the media query decides.
 * Testing the real code path is the whole point — a Storybook-only class would prove nothing.
 */
function ThemedStory({
  theme,
  children,
}: {
  theme: 'light' | 'dark' | 'system';
  children: React.ReactNode;
}) {
  React.useLayoutEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    // next/font emits the --font-* variables through these classes; the app puts them on <html>.
    for (const variable of fontVariables.split(' ')) root.classList.add(variable);
  }, [theme]);

  return <ThemeProvider>{children}</ThemeProvider>;
}

const withTheme: Decorator = (Story, context) => (
  <ThemedStory theme={context.globals.theme as 'light' | 'dark' | 'system'}>
    <Story />
  </ThemedStory>
);

const preview: Preview = {
  decorators: [withTheme],
  initialGlobals: {
    theme: 'light',
    backgrounds: { value: 'transparent' },
  },
  globalTypes: {
    theme: {
      description: 'Lumen theme',
      toolbar: {
        title: 'Theme',
        icon: 'contrast',
        items: [
          { value: 'light', icon: 'sun', title: 'Light' },
          { value: 'dark', icon: 'moon', title: 'Dark' },
          { value: 'system', icon: 'browser', title: 'System' },
        ],
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    layout: 'centered',
    controls: { expanded: true, matchers: { color: /(background|color)$/i, date: /Date$/i } },
    a11y: { test: 'error' },
    viewport: {
      options: {
        mobile: { name: 'Mobile (375)', styles: { width: '375px', height: '812px' } },
        tablet: { name: 'Tablet (768)', styles: { width: '768px', height: '1024px' } },
        laptop: { name: 'Laptop (1280)', styles: { width: '1280px', height: '800px' } },
        wide: { name: 'Wide (1440)', styles: { width: '1440px', height: '900px' } },
      },
    },
    options: {
      storySort: {
        order: ['Primitives', 'Notes', 'Domain', 'Study', 'Kitchen Sink', 'Screens'],
      },
    },
  },
};

export default preview;
