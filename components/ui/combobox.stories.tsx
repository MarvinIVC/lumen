import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Panel } from '../../.storybook/story-helpers';

import { Combobox } from './combobox';
import type { ComboboxOption } from './combobox';
import { Field } from './field';

const COURSES: ComboboxOption[] = [
  { value: 'ap-chem', label: 'AP Chemistry', detail: 'College Board · science' },
  { value: 'ap-bio', label: 'AP Biology', detail: 'College Board · science' },
  { value: 'ap-ush', label: 'AP US History', detail: 'College Board · history' },
  { value: 'ib-chem-hl', label: 'Chemistry HL', detail: 'IB Diploma · science' },
  { value: 'ib-eng-a', label: 'English A: Literature', detail: 'IB Diploma · literature' },
  { value: 'igcse-phys', label: 'IGCSE Physics', detail: 'Cambridge · science' },
  { value: 'al-maths', label: 'A-Level Mathematics', detail: 'Edexcel · mathematics' },
];

const meta: Meta<typeof Combobox> = {
  title: 'Primitives/Combobox',
  component: Combobox,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof Combobox>;

function Demo({ allowCustomValue = false }: { allowCustomValue?: boolean }) {
  const [value, setValue] = useState<string | null>('ap-chem');
  return (
    <Panel width={380}>
      <Field
        label="Course"
        hint={
          allowCustomValue
            ? 'Not listed? Type it and press Enter — we will use your wording.'
            : 'Type to filter.'
        }
      >
        <Combobox
          options={COURSES}
          value={value}
          onValueChange={setValue}
          allowCustomValue={allowCustomValue}
          placeholder="Search courses"
        />
      </Field>
    </Panel>
  );
}

export const Default: Story = { render: () => <Demo /> };
export const AllowsACourseWeHaveNeverHeardOf: Story = {
  render: () => <Demo allowCustomValue />,
};
