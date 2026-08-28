import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { ScrollArea } from './scroll-area';

const meta: Meta<typeof ScrollArea> = {
  title: 'Primitives/ScrollArea',
  component: ScrollArea,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof ScrollArea>;

const TERMS = [
  'Mole',
  'Avogadro constant',
  'Atomic mass unit',
  'Molar mass',
  'Isotopes',
  'Mass number',
  'Relative atomic mass',
  'Mass-to-charge ratio',
  'Pure substance',
  'Empirical formula',
  'Molecular formula',
  'Formula unit',
  'Law of definite proportions',
  'Mixture',
];

export const Default: Story = {
  render: () => (
    <ScrollArea label="Glossary terms" className="h-48 w-64 rounded-md border border-border">
      <ul className="flex flex-col gap-2 p-3">
        {TERMS.map((term) => (
          <li key={term} className="text-sm text-text-muted">
            {term}
          </li>
        ))}
      </ul>
    </ScrollArea>
  ),
};
