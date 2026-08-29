import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { waitFor } from 'storybook/test';

import { Case, Stack } from '../../../.storybook/story-helpers';

import { InlineMath } from './inline-math';
import { MathBlock } from './math-block';

/**
 * KaTeX with the mhchem extension (06 §1). Loaded on first use and never statically imported, so
 * a note with no maths pays nothing for it.
 *
 * A formula KaTeX cannot parse shows the raw LaTeX in a muted mono chip — never a red error box.
 * The student sees what they wrote, which is the most useful thing we can offer at that point.
 */
const meta: Meta = {
  title: 'Notes/Math',
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="lumen-note mx-auto max-w-(--measure)">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj;

const waitForMath: NonNullable<Story['play']> = async ({ canvasElement }) => {
  await waitFor(() => {
    if (!canvasElement.querySelector('.katex')) throw new Error('KaTeX has not rendered yet');
  });
  await document.fonts.ready;
};

export const Display: Story = {
  play: waitForMath,
  render: () => (
    <Stack gap={24}>
      <Case label="numbered">
        <MathBlock
          latex="A_r = \sum_i (\text{isotope mass})_i \times (\text{fractional abundance})_i"
          number="1.3"
        />
      </Case>
      <Case label="unnumbered">
        <MathBlock latex="pH = -\log_{10}[\ce{H+}]" />
      </Case>
      <Case label="wide enough to scroll on a narrow column — and therefore focusable">
        <MathBlock latex="\ce{Cr2O7^2- + 14H+ + 6Fe^2+ -> 2Cr^3+ + 6Fe^3+ + 7H2O}" number="4.2" />
      </Case>
      <Case label="unparseable — the source survives, in a muted chip">
        <MathBlock latex="\thisIsNotACommand{x}" />
      </Case>
    </Stack>
  ),
};

/** mhchem is the reason chemistry renders at all: isotopes, charges, states, reaction arrows. */
export const Chemistry: Story = {
  play: waitForMath,
  render: () => (
    <Stack gap={16}>
      <p className="leading-note">
        Chlorine-35 is written <InlineMath latex="\ce{^{35}_{17}Cl}" />, a calcium ion{' '}
        <InlineMath latex="\ce{Ca^2+}" />, carbonate <InlineMath latex="\ce{CO3^2-}" />, and solid
        sodium chloride <InlineMath latex="\ce{NaCl(s)}" />.
      </p>
      <MathBlock latex="\ce{2H2 + O2 ->[\Delta] 2H2O}" />
      <MathBlock latex="\ce{CH3COOH + H2O <=> CH3COO- + H3O+}" />
    </Stack>
  ),
};

export const Inline: Story = {
  play: waitForMath,
  render: () => (
    <p className="leading-note">
      A sample containing <InlineMath latex="n = 2.17" /> mol of mercury holds{' '}
      <InlineMath latex="N = nN_A = 1.31\times10^{24}" /> atoms — inline maths sits on the text
      baseline and matches the surrounding size, so it does not push the line-height around.
    </p>
  ),
};
