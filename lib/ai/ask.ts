/**
 * "Ask about this" (phase-05 §11) — the one non-JSON call in the product.
 *
 * Small enough that it is a function rather than a pipeline, and that is the point. There is no
 * schema to validate, no repair ladder and no verify pass, because the output is two sentences of
 * prose: the failure mode of a bad answer is that the student reads it and dismisses it, not a
 * document that will not render. Everything `runEnhance` does to guarantee a renderable artefact
 * would be cost and latency spent on a paragraph.
 *
 * It streams anyway. Two sentences from a reasoning-capable model is still several seconds, and
 * text that appears as it is written reads as thinking rather than as hanging.
 */
import { buildAskPrompt } from './prompts/index.ts';
import type { BuildAskPromptInput } from './prompts/index.ts';
import type { ChatUsage, LLMProvider } from './provider.ts';
import type { LedgerUsage } from './router.ts';

export interface AskUsage extends LedgerUsage {
  cacheHit: boolean;
}

export type AskEvent =
  | { type: 'delta'; text: string }
  | { type: 'answer'; text: string }
  | { type: 'usage'; usage: AskUsage }
  | { type: 'error'; code: 'provider' | 'empty' | 'aborted'; message: string };

export interface AskRun {
  provider: LLMProvider;
  input: BuildAskPromptInput;
  maxTokens: number;
  temperature: number;
  timeoutMs?: number;
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
  signal: AbortSignal;
}

export async function* runAsk(run: AskRun): AsyncGenerator<AskEvent> {
  const prompt = buildAskPrompt(run.input);

  let text = '';
  let usage: ChatUsage | null = null;
  let failure: string | null = null;
  let aborted = false;

  for await (const chunk of run.provider.chat({
    system: prompt.system,
    cachePrefix: prompt.cachePrefix,
    messages: prompt.messages,
    json: false,
    maxTokens: run.maxTokens,
    temperature: run.temperature,
    ...(run.timeoutMs ? { timeoutMs: run.timeoutMs } : {}),
    ...(run.reasoningEffort ? { reasoningEffort: run.reasoningEffort } : {}),
    signal: run.signal,
  })) {
    if (chunk.type === 'text') {
      text += chunk.text;
      yield { type: 'delta', text: chunk.text };
    } else if (chunk.type === 'usage') {
      usage = chunk.usage;
    } else if (chunk.type === 'error') {
      failure = chunk.error.message;
    } else if (chunk.type === 'done' && chunk.finishReason === 'abort') {
      aborted = true;
    }
  }

  const totals = {
    tokensIn: usage?.tokensIn ?? 0,
    tokensOut: usage?.tokensOut ?? 0,
    cachedTokensIn: usage?.cachedTokensIn ?? 0,
  };
  const spent: AskUsage = {
    ...totals,
    byModel: { [run.provider.model]: { ...totals } },
    cacheHit: totals.cachedTokensIn > 0,
    provider: run.provider.id,
    model: run.provider.model,
    charged: false,
  };

  if (aborted || run.signal.aborted) {
    yield { type: 'usage', usage: spent };
    yield { type: 'error', code: 'aborted', message: 'That question was cancelled.' };
    return;
  }

  const answer = text.trim();
  if (!answer) {
    yield { type: 'usage', usage: spent };
    yield {
      type: 'error',
      code: failure ? 'provider' : 'empty',
      message: failure ?? 'We did not get an answer back. Try asking again.',
    };
    return;
  }

  yield { type: 'answer', text: answer };
  yield { type: 'usage', usage: { ...spent, charged: true } };
}
