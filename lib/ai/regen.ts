/**
 * Regenerating one section (phase-05 §10).
 *
 * A deliberately much shorter pipeline than `runEnhance`, and the differences are all decisions:
 *
 *   No verify pass. The examiner in 04 §6 checks a draft against the syllabus and the *original
 *   notes*, and its patches are applied by quoting text inside a named section of a whole
 *   document. A fragment gives it neither. Running it here would double the cost of the cheapest
 *   call in the product to check a section that the student is about to read, in a diff, before it
 *   is applied to anything.
 *
 *   No degrade ladder. `runEnhance` will re-run in `tidy` and then ship a thinned document rather
 *   than leave a student with nothing, because at that point there is no note at all. Here there
 *   already is one. A regenerate that cannot produce something valid must fail and leave the
 *   original standing (01-PRODUCT.md §5, "regenerate failure keeps the original") — a half-usable
 *   replacement for a section that was fine is a worse outcome than no replacement.
 *
 *   One repair attempt, because unparseable JSON is cheap to ask again for and the student is
 *   watching a spinner either way.
 *
 * It shares the provider, the prompt assembly and the block rules with the full pipeline, so a
 * formula that arrives without units is caught by the same rule that catches it in a generation.
 */
import { buildEnhancePrompt } from './prompts/index.ts';
import { largestValidJson } from './stream-parse.ts';
import { validateSectionFragment } from './validate.ts';
import type { BuildEnhancePromptInput, RegenerateScope } from './prompts/index.ts';
import type { ChatUsage, LLMProvider, ProviderError, ProviderId } from './provider.ts';
import type { LedgerUsage } from './router.ts';
import type { Correction, GlossaryEntry, OpenQuestion, Section } from './schema.ts';

export type RegenPhase = 'generating' | 'repairing' | 'finalising';

export interface RegenFragment {
  section: Section;
  corrections: Correction[];
  openQuestions: OpenQuestion[];
  glossary: GlossaryEntry[];
}

export type RegenEvent =
  | { type: 'start'; provider: ProviderId; model: string }
  | { type: 'status'; phase: RegenPhase }
  | { type: 'fragment'; fragment: RegenFragment }
  | { type: 'usage'; usage: RegenUsage }
  | { type: 'error'; code: 'provider' | 'unparseable' | 'invalid' | 'aborted'; message: string };

/** `charged` is false for an abort or a failure: a regenerate that produced nothing costs nothing. */
export interface RegenUsage extends LedgerUsage {
  cacheHit: boolean;
}

export interface RegenRun {
  provider: LLMProvider;
  input: Omit<BuildEnhancePromptInput, 'scope'>;
  scope: RegenerateScope;
  maxTokens: number;
  temperature: number;
  timeoutMs?: number;
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
  signal: AbortSignal;
}

interface CallResult {
  text: string;
  usage: ChatUsage | null;
  error: ProviderError | null;
  aborted: boolean;
}

async function call(
  provider: LLMProvider,
  request: Parameters<LLMProvider['chat']>[0],
): Promise<CallResult> {
  let text = '';
  let usage: ChatUsage | null = null;
  let error: ProviderError | null = null;
  let aborted = false;

  for await (const chunk of provider.chat(request)) {
    if (chunk.type === 'text') text += chunk.text;
    else if (chunk.type === 'usage') usage = chunk.usage;
    else if (chunk.type === 'error') error = chunk.error;
    else if (chunk.type === 'done' && chunk.finishReason === 'abort') aborted = true;
  }

  return { text, usage, error, aborted };
}

export async function* runRegenerate(run: RegenRun): AsyncGenerator<RegenEvent> {
  const prompt = buildEnhancePrompt({ ...run.input, scope: run.scope });
  const totals = { tokensIn: 0, tokensOut: 0, cachedTokensIn: 0 };

  const add = (usage: ChatUsage | null) => {
    if (!usage) return;
    totals.tokensIn += usage.tokensIn;
    totals.tokensOut += usage.tokensOut;
    totals.cachedTokensIn += usage.cachedTokensIn ?? 0;
  };

  const finish = (charged: boolean): RegenUsage => ({
    ...totals,
    byModel: { [run.provider.model]: { ...totals } },
    cacheHit: totals.cachedTokensIn > 0,
    provider: run.provider.id,
    model: run.provider.model,
    charged,
  });

  yield { type: 'start', provider: run.provider.id, model: run.provider.model };
  yield { type: 'status', phase: 'generating' };

  const request = {
    system: prompt.system,
    cachePrefix: prompt.cachePrefix,
    messages: prompt.messages,
    json: true,
    maxTokens: run.maxTokens,
    temperature: run.temperature,
    ...(run.timeoutMs ? { timeoutMs: run.timeoutMs } : {}),
    ...(run.reasoningEffort ? { reasoningEffort: run.reasoningEffort } : {}),
    signal: run.signal,
  };

  let result = await call(run.provider, request);
  add(result.usage);

  if (run.signal.aborted || result.aborted) {
    yield { type: 'usage', usage: finish(false) };
    yield { type: 'error', code: 'aborted', message: 'That regeneration was cancelled.' };
    return;
  }

  if (result.error && !result.text) {
    yield { type: 'usage', usage: finish(false) };
    yield { type: 'error', code: 'provider', message: result.error.message };
    return;
  }

  let value = largestValidJson(result.text);

  if (!isObject(value) && result.text.trim()) {
    yield { type: 'status', phase: 'repairing' };
    result = await call(run.provider, {
      ...request,
      messages: [
        {
          role: 'user',
          content: `Return ONLY corrected valid JSON for the section shape. Do not change content.\n\n${result.text}`,
        },
      ],
    });
    add(result.usage);
    value = largestValidJson(result.text);
  }

  if (!isObject(value)) {
    yield { type: 'usage', usage: finish(false) };
    yield {
      type: 'error',
      code: 'unparseable',
      message: 'The model did not return a usable section.',
    };
    return;
  }

  const validated = validateSectionFragment(value);
  if (!validated.ok || !validated.section) {
    yield { type: 'usage', usage: finish(false) };
    yield {
      type: 'error',
      code: 'invalid',
      message: 'The rewritten section did not pass our checks, so we kept the one you had.',
    };
    return;
  }

  yield { type: 'status', phase: 'finalising' };
  yield {
    type: 'fragment',
    fragment: {
      section: { ...validated.section, id: run.scope.sectionId },
      corrections: validated.corrections ?? [],
      openQuestions: validated.openQuestions ?? [],
      glossary: validated.glossary ?? [],
    },
  };
  yield { type: 'usage', usage: finish(true) };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
