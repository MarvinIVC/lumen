/**
 * Driving the real pipeline over a fixture.
 *
 * The provider is the only thing that changes between CI and the nightly run: in CI it replays a
 * recorded response, nightly it is DeepSeek on a tiny budget. Everything else — prompt assembly,
 * the tolerant parse, validation, repair, the verify pass, the patch application — is the code
 * students run, imported from `lib/ai`. A release gate that tested a reimplementation of the
 * pipeline would be testing the wrong thing.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { runEnhance } from '@/lib/ai/enhance';
import { buildPackBlock, genericBlock, matchPack } from '@/lib/curriculum/load';
import { staticPackSource } from '@/lib/curriculum/registry';
import { createDeepSeekProvider } from '@/lib/ai/providers/deepseek';
import { chunked, createMockProvider } from './mock-provider';
import type { MockProvider } from './mock-provider';
import type { PipelineEvent, RunUsage } from '@/lib/ai/enhance';
import type { LLMProvider } from '@/lib/ai/provider';
import type { NoteDocument } from '@/lib/ai/schema';
import type { EvalCase } from './cases';

const ROOT = resolve(import.meta.dirname, '../..');

export interface RecordedResponse {
  /** What the model returned for the enhance call, as an object. */
  response: unknown;
  /** What the examiner returned for the verify pass, when the case exercises one. */
  verify?: unknown;
  /** Where this recording came from, so nobody mistakes a hand-authored one for a real capture. */
  source?: string;
  tokensIn?: number;
  tokensOut?: number;
  cachedTokensIn?: number;
}

export function loadRecorded(id: string): RecordedResponse {
  return JSON.parse(
    readFileSync(resolve(ROOT, 'tests/ai-evals/recorded', `${id}.json`), 'utf8'),
  ) as RecordedResponse;
}

/**
 * A provider that replays a recording.
 *
 * Chunked at 37 bytes rather than sent whole, deliberately: it makes every CI run exercise the
 * tolerant streaming parser on real content, with boundaries landing inside strings and escapes.
 */
export function recordedProvider(id: string): MockProvider {
  const recorded = loadRecorded(id);
  const verify = recorded.verify ?? { patches: [], calculations: [], flags: [], verdict: 'ok' };
  return createMockProvider(
    [
      {
        chunks: chunked(JSON.stringify(recorded.response), 37),
        ...(recorded.tokensIn ? { tokensIn: recorded.tokensIn } : {}),
        ...(recorded.tokensOut ? { tokensOut: recorded.tokensOut } : {}),
      },
      { chunks: chunked(JSON.stringify(verify), 64) },
    ],
    { model: 'deepseek-v4-flash' },
  );
}

/** The live provider, for the nightly run. Returns null when there is no key, which is most runs. */
export function liveProvider(): LLMProvider | null {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  return createDeepSeekProvider({
    id: 'deepseek',
    model: process.env.EVAL_MODEL ?? 'deepseek-v4-flash',
    apiKey,
    ...(process.env.DEEPSEEK_BASE_URL ? { baseUrl: process.env.DEEPSEEK_BASE_URL } : {}),
    pricePerMTokIn: 2.9568,
    pricePerMTokOut: 8.8704,
  });
}

export interface RunResult {
  document: NoteDocument | null;
  refused: string | null;
  error: { code: string; message: string } | null;
  usage: RunUsage | null;
  events: PipelineEvent[];
  /** Sections in the order the reveal received them — the streaming contract, checked. */
  streamedSections: number[];
}

export async function runCase(
  evalCase: EvalCase,
  provider: LLMProvider,
  options: { verifier?: LLMProvider | null; signal?: AbortSignal } = {},
): Promise<RunResult> {
  const match = await matchPack(evalCase.context, staticPackSource);
  const packBlock = match ? buildPackBlock(match) : genericBlock(evalCase.context);

  const events: PipelineEvent[] = [];
  const streamedSections: number[] = [];
  let document: NoteDocument | null = null;
  let refused: string | null = null;
  let error: RunResult['error'] = null;
  let usage: RunUsage | null = null;

  for await (const event of runEnhance({
    provider,
    fallback: null,
    verifier: options.verifier ?? provider,
    input: {
      context: evalCase.context,
      options: evalCase.options,
      packBlock,
      extract: evalCase.raw,
    },
    maxTokens: 10_000,
    temperature: 0.3,
    verifyTokens: 3000,
    verifyFamilies: ['stem-quantitative', 'stem-descriptive'],
    signal: options.signal ?? new AbortController().signal,
  })) {
    events.push(event);
    if (event.type === 'section') streamedSections.push(event.index);
    else if (event.type === 'document') document = event.document;
    else if (event.type === 'refused') refused = event.reason;
    else if (event.type === 'usage') usage = event.usage;
    else if (event.type === 'error') error = { code: event.code, message: event.message };
  }

  return { document, refused, error, usage, events, streamedSections };
}
