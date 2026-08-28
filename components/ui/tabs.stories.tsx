import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Case, Panel, Stack } from '../../.storybook/story-helpers';

import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

const meta: Meta<typeof Tabs> = {
  title: 'Primitives/Tabs',
  component: Tabs,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof Tabs>;

export const Underline: Story = {
  render: () => (
    <Panel width={520}>
      <Tabs defaultValue="note">
        <TabsList>
          <TabsTrigger value="note">Note</TabsTrigger>
          <TabsTrigger value="flashcards">Flashcards</TabsTrigger>
          <TabsTrigger value="quiz">Quiz</TabsTrigger>
          <TabsTrigger value="sources" disabled>
            Sources
          </TabsTrigger>
        </TabsList>
        <TabsContent value="note" className="text-sm text-text-muted">
          The finished study guide.
        </TabsContent>
        <TabsContent value="flashcards" className="text-sm text-text-muted">
          14 cards, generated from the key terms and formulas.
        </TabsContent>
        <TabsContent value="quiz" className="text-sm text-text-muted">
          8 questions with worked explanations.
        </TabsContent>
      </Tabs>
    </Panel>
  ),
};

/** The shape `OptionsPanel` and the reading-mode toggle use. */
export const Segmented: Story = {
  render: () => (
    <Panel width={420}>
      <Stack gap={24}>
        <Case label="segmented">
          <Tabs defaultValue="everything">
            <TabsList variant="segmented" className="w-full">
              <TabsTrigger variant="segmented" value="original">
                My original
              </TabsTrigger>
              <TabsTrigger variant="segmented" value="everything">
                Everything
              </TabsTrigger>
              <TabsTrigger variant="segmented" value="highlight">
                Highlight AI
              </TabsTrigger>
            </TabsList>
            <TabsContent value="original" className="text-sm text-text-muted">
              Only the fragments you wrote yourself.
            </TabsContent>
            <TabsContent value="everything" className="text-sm text-text-muted">
              Your notes plus everything we added, marked but calm.
            </TabsContent>
            <TabsContent value="highlight" className="text-sm text-text-muted">
              The same note with every AI mark turned up.
            </TabsContent>
          </Tabs>
        </Case>
      </Stack>
    </Panel>
  ),
};
