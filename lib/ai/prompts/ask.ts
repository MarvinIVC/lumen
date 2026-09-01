/**
 * "Ask about this" (phase-05 §11).
 *
 * The one call in the product that is not JSON. A student highlights the definition of the mole,
 * types "why 6.022 and not a round number?", and wants two sentences back — not a document, not a
 * schema, not a study guide. Wrapping that in the NoteDocument pipeline would cost a rubric, a
 * validator and a verify pass to deliver a paragraph, and would make the answer worse: the model
 * would be writing to a schema instead of to the question.
 *
 * So the prompt is small, the output is prose, and the guardrails are the ones that still matter
 * at this size — stay on the syllabus, say when you are not sure, never invent a citation.
 *
 * The length limit is doing real work. This is the cheapest call in the product and the easiest to
 * press repeatedly, and an answer that runs to four paragraphs is both more expensive and less
 * useful than the two sentences the student actually wanted. It is also what makes the result
 * insertable as a margin note without reformatting.
 */
export const ASK_SYSTEM = [
  'You are a patient, precise teacher answering one question about one passage of a student’s own',
  'study notes. You are talking to a smart 16-year-old as a peer.',
  '',
  'Rules:',
  '- Answer in plain prose. No headings, no bullet lists, no JSON, no markdown tables.',
  '- Three sentences at most. Usually one or two is right.',
  '- Inline maths and chemistry use LaTeX between single dollar signs, mhchem for formulae:',
  '  $\\ce{CO3^2-}$, $n = m/M$. Nothing else may be marked up.',
  '- Stay inside the course and level you are given. If the honest answer is beyond it, say so in',
  '  one clause and give the answer that is inside it.',
  '- If the passage does not contain enough to answer, say what is missing rather than guessing.',
  '- Never invent a citation, a source, a date or a datum. If you are unsure, say you are unsure.',
  '- Do not restate the question and do not open with a preamble. Start with the answer.',
].join('\n');

export interface BuildAskPromptInput {
  /** The text the student selected. */
  selection: string;
  question: string;
  /** Course and level, so the answer lands at the right depth. */
  course: string;
  curriculum: string;
  /** BCP-47 — the answer comes back in the language the note is in (01-PRODUCT.md §7). */
  language: string;
  /** The surrounding section, for context the selection alone does not carry. */
  sectionText?: string;
}

export function buildAskUser(input: BuildAskPromptInput): string {
  const lines = [
    `COURSE: ${input.course || 'unspecified'} (${input.curriculum})`,
    `ANSWER IN: ${input.language}`,
  ];
  if (input.sectionText?.trim()) {
    lines.push('--- THE SECTION THIS CAME FROM ---', input.sectionText.trim(), '--- END ---');
  }
  lines.push(
    '--- THE PASSAGE THE STUDENT SELECTED ---',
    input.selection.trim(),
    '--- END ---',
    'QUESTION:',
    input.question.trim(),
  );
  return lines.join('\n');
}
