import type { StorybookConfig } from '@storybook/nextjs-vite';

/**
 * Storybook is the workshop for the design system (03-DESIGN.md §5): every component gets a story
 * with all its variants, and the a11y addon runs against each one. Stories live next to the
 * component they document so a change and its proof move together.
 */
const config: StorybookConfig = {
  stories: [
    '../components/**/*.mdx',
    '../components/**/*.stories.@(ts|tsx)',
    '../lib/render/**/*.stories.@(ts|tsx)',
  ],
  addons: [
    '@storybook/addon-docs',
    // Axe on every story. The phase-01 definition of done is "no violations on any story".
    '@storybook/addon-a11y',
    '@storybook/addon-themes',
    '@storybook/addon-vitest',
  ],
  framework: { name: '@storybook/nextjs-vite', options: {} },
  staticDirs: ['../public'],
  typescript: { reactDocgen: 'react-docgen-typescript' },
};

export default config;
