import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Case, Panel, Stack } from '../../.storybook/story-helpers';

import { Switch } from './switch';

const meta: Meta<typeof Switch> = {
  title: 'Primitives/Switch',
  component: Switch,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof Switch>;

export const Default: Story = {
  render: () => <Switch defaultChecked label="Highlight AI" />,
};

export const States: Story = {
  render: () => (
    <Panel width={420}>
      <Stack gap={20}>
        <Case label="off and on">
          <Stack gap={12}>
            <Switch label="Highlight AI" />
            <Switch defaultChecked label="Highlight AI" />
          </Stack>
        </Case>
        <Case label="justified — the settings-row shape">
          <Stack gap={14}>
            <Switch
              justified
              defaultChecked
              label="Show margin notes"
              hint="Connections, mnemonics and exam tips beside the text."
            />
            <Switch
              justified
              label="Bilingual glossary"
              hint="Adds the English term next to each translated one."
            />
          </Stack>
        </Case>
        <Case label="disabled">
          <Switch justified disabled label="Push to Drive" hint="Connect Google Drive first." />
        </Case>
      </Stack>
    </Panel>
  ),
};

/** Bare — no label — for a toolbar where the name lives on the surrounding control. */
export const Unlabelled: Story = {
  render: () => <Switch defaultChecked aria-label="Highlight AI" />,
};
