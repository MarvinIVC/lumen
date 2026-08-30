/**
 * DOMAIN_TEMPLATE_BLOCK per domain family (04-AI-ENGINE.md §4.3).
 *
 * Each block is (a) family-specific structure guidance and (b) the schema, restated so it is the
 * last stable thing the model reads before the notes themselves. They are `user[1]` in the cached
 * prefix, so like the rubric they must stay free of anything volatile.
 *
 * The families come from `lib/curriculum/detect.ts` -> `domainFamilyFor()`, so a subject the
 * heuristic cannot place lands on `generic`, which blends rather than guesses.
 */
import type { DomainFamily } from '../schema';

import { SCHEMA_BLOCK } from './schema-block';

const STEM_QUANTITATIVE = `## Structure for a quantitative science lesson (Chemistry, Physics, Maths, Economics)

Lead with the concept, then the formula, then the worked example, then the pitfall — a student who
reads only the first line of each still learns the lesson in the right order.

- Prioritise \`formula\`, \`workedExample\`, \`structure\` and quantitative \`diagram\` blocks.
- Every formula is three parts (equation, every symbol with units, "use this when"). A formula
  block with an unlabelled symbol is a defect, not a shortcut.
- Units and significant figures are graded. Carry units through every step of a worked example and
  state the significant figures the data supports in the final answer.
- Where the student attempted a calculation, finish it in their notation, box the answer, and add
  the one mistake most students make on that step.
- A conversion or a process earns a small \`mermaid\` flowchart. A spectrum, a titration curve or a
  distribution earns a \`chart\` diagram with illustrative values, said to be illustrative.`;

const STEM_DESCRIPTIVE = `## Structure for a descriptive science lesson (Biology, Environmental, Earth science)

Lead with definitions, then the labelled process, then the comparison, then cause and effect.

- Prioritise \`definition\`, \`diagram\` (process or cycle, as a mermaid flowchart), \`table\`
  (classification and comparison) and \`misconception\` blocks.
- Name every stage of every process, in order, with what changes at each stage and where it happens.
- Comparisons belong in a table with the axis of comparison as the first column, not in prose.
- State cause and effect explicitly: what causes what, in which direction, and what would happen if
  it were removed.
- Quantities still take units, and a number quoted from the notes stays the student's; do not
  "improve" an experimental value you cannot source.`;

const HISTORY_SOCIAL = `## Structure for a history or social-science lesson

Lead with chronology and causation. A date without a consequence is trivia.

- Prioritise \`table\` (compare and contrast, before and after), \`diagram\` (a mermaid timeline for
  sequence, a flowchart for causation) and margin \`connection\` notes.
- Separate long-term causes from the trigger, and say which historians would emphasise which.
- Give each key figure or event its significance in one line: what changed because of it.
- Where interpretations differ, present them as interpretations with their evidence, not as a
  single settled account.
- **Quotations only if the student supplied them.** Never invent a source, a date, a statistic or
  a historian's name. If the student paraphrased, keep it a paraphrase.`;

const LITERATURE_LANGUAGE_ARTS = `## Structure for a literature or language-arts lesson

Lead with the text in its context, then device, then theme, then structure and character.

- **Every literary device must be tied to a specific quotation the student supplied.** A device
  with no quotation from their notes is not evidence and must not be written as though it were.
- Never fabricate quotations, line numbers, act/scene references or page numbers. If the student
  paraphrased a passage, analyse the paraphrase and say that is what it is.
- Trace each theme through the text: where it appears, how it develops, where it resolves.
- Offer critical lenses as lenses ("read through a feminist lens, the scene reads as…"), and two
  or three essay angles the student could actually argue with the evidence they have.
- Prioritise \`definition\` (terms of art), \`table\` (device / quotation / effect) and \`callout\`
  blocks; use \`marginNote\` with kind \`connection\` for links to other texts on the course.`;

const LANGUAGE_ACQUISITION = `## Structure for a language-acquisition lesson (Chinese, Spanish, French…)

Lead with usable language, not with grammar theory.

- Vocabulary goes in a \`table\`: word / reading or pronunciation / meaning / an example sentence
  that uses it naturally.
- Every grammar pattern gets the pattern itself, two or three examples, and the register or usage
  note that says when a native speaker would actually use it.
- Give sentence frames the student can fill in, not only rules they can recite.
- Keep target-language content **in the target language** and gloss it in the student's language.
  Do not translate away the thing being learned.
- Culture notes where they change meaning. Prioritise \`table\`, \`definition\` and \`callout\`.`;

const GENERIC = `## Structure for a lesson with no matched family

Infer the closest family from the notes themselves and blend: a lesson that calculates gets
formulas and worked examples; a lesson that narrates gets chronology and causation; a lesson that
reads a text gets device-with-quotation analysis.

Do not expand a single lesson into a textbook chapter. Match the depth of what the student was
taught, define every term, make every formula three parts, finish every example, log every fix,
and add the visuals a teacher would have drawn on the board.`;

const FAMILY_GUIDANCE: Record<DomainFamily, string> = {
  'stem-quantitative': STEM_QUANTITATIVE,
  'stem-descriptive': STEM_DESCRIPTIVE,
  'history-social': HISTORY_SOCIAL,
  'literature-language-arts': LITERATURE_LANGUAGE_ARTS,
  'language-acquisition': LANGUAGE_ACQUISITION,
  generic: GENERIC,
};

export const DOMAIN_TEMPLATE_BLOCKS: Record<DomainFamily, string> = Object.fromEntries(
  (Object.keys(FAMILY_GUIDANCE) as DomainFamily[]).map((family) => [
    family,
    `${FAMILY_GUIDANCE[family]}\n\n${SCHEMA_BLOCK}`,
  ]),
) as Record<DomainFamily, string>;

export function domainTemplateBlock(family: DomainFamily | undefined): string {
  return DOMAIN_TEMPLATE_BLOCKS[family ?? 'generic'] ?? DOMAIN_TEMPLATE_BLOCKS.generic;
}
