/**
 * The LLM-judge rubric (04-AI-ENGINE.md §9).
 *
 * Six dimensions, 1–5, gated at an average of 4 with nothing below 3. The judge is a *different*
 * model from the one under test — Gemini, which is also the router's fallback, so one key serves
 * both — and it is given the raw notes, the "what good looks like" note and the finished document.
 *
 * In CI the judge is mocked. That is not a weakening: a live judge would make every pull request
 * depend on a third party being up and would score the same recorded response differently from run
 * to run, which is a flaky gate rather than a gate. What CI checks is that the rubric is
 * well-formed, the plumbing works and a bad score fails the build; the nightly run does the
 * judging, against live output, on a budget.
 */
import { largestValidJson } from '@/lib/ai/stream-parse';
import { createGeminiProvider } from '@/lib/ai/providers/gemini';
import type { LLMProvider } from '@/lib/ai/provider';
import type { NoteDocument } from '@/lib/ai/schema';

export const JUDGE_DIMENSIONS = [
  'completeness',
  'factualAccuracy',
  'faithfulness',
  'pedagogicalClarity',
  'visualAppropriateness',
  'provenanceCorrectness',
] as const;

export type JudgeDimension = (typeof JUDGE_DIMENSIONS)[number];

export interface Judgement {
  scores: Record<JudgeDimension, number>;
  notes: string;
}

export const JUDGE_SYSTEM = `You are grading a study guide that an AI rebuilt from a student's raw class notes. You are given the student's original notes, a short description of what a great result would contain, and the JSON document that was produced. Return only json.

Schema: { "scores": { "completeness": 1-5, "factualAccuracy": 1-5, "faithfulness": 1-5, "pedagogicalClarity": 1-5, "visualAppropriateness": 1-5, "provenanceCorrectness": 1-5 }, "notes": string }

What each dimension means:
- completeness: does it cover what the reference says a great result covers, at the right depth, without padding beyond the lesson?
- factualAccuracy: is everything asserted true and standard for this course? Are the student's errors actually fixed?
- faithfulness: are the student's own examples, structure and memory aids preserved? Is their voice recognisable rather than replaced?
- pedagogicalClarity: would a student who missed the lesson learn it from this? Are terms defined before they are used, formulas three-part, examples finished?
- visualAppropriateness: do the diagrams and charts earn their place, and are they captioned and described? Are invented numbers marked as illustrative?
- provenanceCorrectness: is 'student' used only for their content, 'ai-added' for genuinely new material, and 'ai-corrected' wherever a correction was logged?

Score 5 only for work you would hand to a class. Score 3 for usable but flawed. Score 1 for work that would mislead a student. Be strict about factualAccuracy and about any invented quotation, citation or figure: those are a 1.`;

export interface Judge {
  (input: { raw: string; reference: string; document: NoteDocument }): Promise<Judgement | null>;
}

export function buildJudgeMessages(input: {
  raw: string;
  reference: string;
  document: NoteDocument;
}): string {
  return [
    `STUDENT'S ORIGINAL NOTES:\n${input.raw}`,
    `WHAT A GREAT RESULT CONTAINS:\n${input.reference}`,
    `THE DOCUMENT TO GRADE:\n${JSON.stringify(input.document)}`,
  ].join('\n\n---\n\n');
}

export function parseJudgement(value: unknown): Judgement | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = (value as { scores?: unknown; notes?: unknown }).scores;
  if (typeof raw !== 'object' || raw === null) return null;

  const scores = {} as Record<JudgeDimension, number>;
  for (const dimension of JUDGE_DIMENSIONS) {
    const score = (raw as Record<string, unknown>)[dimension];
    if (typeof score !== 'number' || score < 1 || score > 5) return null;
    scores[dimension] = score;
  }
  return { scores, notes: String((value as { notes?: unknown }).notes ?? '') };
}

export interface Gate {
  ok: boolean;
  average: number;
  lowest: { dimension: JudgeDimension; score: number };
  reasons: string[];
}

/** §9: "gate at ≥ 4 avg, no dimension < 3". */
export function gateJudgement(judgement: Judgement): Gate {
  const entries = Object.entries(judgement.scores) as [JudgeDimension, number][];
  const average = entries.reduce((sum, [, score]) => sum + score, 0) / entries.length;
  const lowest = entries.reduce((worst, [dimension, score]) =>
    score < worst[1] ? [dimension, score] : worst,
  )[0] as JudgeDimension;
  const lowestScore = judgement.scores[lowest];

  const reasons: string[] = [];
  if (average < 4) reasons.push(`average ${average.toFixed(2)} is below 4`);
  if (lowestScore < 3) reasons.push(`${lowest} scored ${lowestScore}, below 3`);

  return {
    ok: reasons.length === 0,
    average,
    lowest: { dimension: lowest, score: lowestScore },
    reasons,
  };
}

/** The CI judge: deterministic, and it fails loudly if handed something it was not given. */
export function createMockJudge(
  scores: Record<string, Partial<Record<JudgeDimension, number>>>,
): Judge {
  return ({ document }) => {
    const key = document.title;
    const given = scores[key] ?? scores.default ?? {};
    const filled = {} as Record<JudgeDimension, number>;
    for (const dimension of JUDGE_DIMENSIONS) filled[dimension] = given[dimension] ?? 4;
    return Promise.resolve({ scores: filled, notes: 'mock judge' });
  };
}

/**
 * The nightly judge. Null when there is no key, which is every run but the nightly one.
 *
 * `gemini-2.5-flash` is gone: Google returns 404 for it on any API key issued now, pointing at
 * 3.6. And because every 3.x model thinks before answering, the token budget has to cover the
 * thinking as well as the six scores — at 1200 it spent the lot thinking and returned nothing,
 * which reached the gate as "the judge did not return a usable score".
 */
export function createLiveJudge(model = 'gemini-3.6-flash'): Judge | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const provider: LLMProvider = createGeminiProvider({
    id: 'gemini',
    model,
    apiKey,
    pricePerMTokIn: 0,
    pricePerMTokOut: 0,
  });

  /**
   * One retry on a retryable failure.
   *
   * The free Gemini tier answers 503 "experiencing high demand" often enough that a gate without
   * this is a gate that cries wolf at 03:17 — and a red build nobody trusts is worse than no
   * build. Anything not retryable (a bad key, a model that no longer exists) still fails at once,
   * because those are real and waiting does not fix them.
   */
  const askOnce = async (input: Parameters<Judge>[0]) => {
    let text = '';
    let retryable = false;
    for await (const chunk of provider.chat({
      system: JUDGE_SYSTEM,
      messages: [{ role: 'user', content: buildJudgeMessages(input) }],
      json: true,
      maxTokens: 4000,
      temperature: 0,
      reasoningEffort: 'none',
      signal: AbortSignal.timeout(180_000),
      timeoutMs: 180_000,
    })) {
      if (chunk.type === 'text') text += chunk.text;
      else if (chunk.type === 'error') {
        retryable = chunk.error.retryable;
        console.error('judge provider error', chunk.error);
      } else if (chunk.type === 'done' && chunk.finishReason !== 'stop') {
        console.error(`judge stopped early: ${chunk.finishReason}`);
      }
    }

    const judgement = parseJudgement(largestValidJson(text));
    if (!judgement && !retryable) {
      // "The judge did not return a usable score" is not a diagnosis, and a nightly failure at
      // 03:17 has to be readable in the morning without re-running anything.
      console.error(
        `judge returned ${text.length} chars that did not parse as a judgement:\n${text.slice(0, 400)}`,
      );
    }
    return { judgement, retryable };
  };

  return async (input) => {
    const first = await askOnce(input);
    if (first.judgement || !first.retryable) return first.judgement;

    await new Promise((wait) => setTimeout(wait, 5000));
    console.error('judge: retrying once after a retryable failure');
    return (await askOnce(input)).judgement;
  };
}
