/**
 * The enhancement pipeline (04-AI-ENGINE.md §2, §7, §8, §6 in that order of appearance).
 *
 * This is the whole of "notes in, NoteDocument out", written as an async generator over provider
 * calls and nothing else: no database, no HTTP, no Deno, no browser. The edge function wraps it in
 * auth, guardrails and SSE; the eval harness drives the identical code with a recorded provider.
 * That is the point — the release gate has to test the pipeline students actually run, not a
 * reimplementation of it.
 *
 * The order of recovery, and why each step exists:
 *
 *   stream → tolerant parse         a note that appears section by section (§7)
 *   ↳ provider fails, retryable?    fallback once, and tell the client to start the reveal over
 *   ↳ unparseable?                  largest valid substring, then one cheap repair call (§8 1–2)
 *   ↳ still bad?                    re-run in `tidy`, the simplest schema there is (§8 3)
 *   ↳ schema errors?                one repair call quoting the specific rules that failed
 *   ↳ still bad?                    degrade — drop what cannot be trusted and say so (§8 4)
 *   → verify pass, patch, re-validate; patches that break the document are dropped whole (§6)
 *
 * Every branch that gives up produces a `document` or an `error`, never a throw, and the caller
 * decides what it costs. `charged` is false unless a real document came out.
 */
import { buildEnhancePrompt, buildVerifyPrompt } from './prompts/index.ts';
import { TolerantJsonStream, largestValidJson } from './stream-parse.ts';
import { applyPatches, parseVerifyResult, shouldVerify } from './verify.ts';
import { degradeDocument, validateNoteDocument } from './validate.ts';
import type { BuildEnhancePromptInput } from './prompts/index.ts';
import type { ChatRequest, ChatUsage, LLMProvider, ProviderError, ProviderId } from './provider.ts';
import type { EnhanceOptions, NoteDocument, ValidationIssue } from './schema.ts';

export type PipelinePhase =
  'generating' | 'restarting' | 'repairing' | 'simplifying' | 'verifying' | 'finalising';

export type PipelineEvent =
  | { type: 'start'; provider: ProviderId; model: string }
  | { type: 'delta'; text: string }
  | { type: 'status'; phase: PipelinePhase; key?: string | null }
  | { type: 'head'; head: { title: unknown; summary: unknown; objectives: unknown } }
  | { type: 'section'; index: number; section: unknown }
  /** Everything streamed so far is void — the fallback provider is starting again from nothing. */
  | { type: 'reset' }
  | { type: 'document'; document: NoteDocument; issues: ValidationIssue[]; degraded: boolean }
  | { type: 'refused'; reason: string }
  | { type: 'usage'; usage: RunUsage }
  | { type: 'error'; code: PipelineErrorCode; message: string; resumable: boolean };

export type PipelineErrorCode = 'provider' | 'unparseable' | 'empty' | 'aborted';

export interface RunUsage {
  tokensIn: number;
  tokensOut: number;
  cachedTokensIn: number;
  /** Per model, because the verify pass may run on a different one from the draft. */
  byModel: Record<string, { tokensIn: number; tokensOut: number; cachedTokensIn: number }>;
  provider: ProviderId;
  model: string;
  fallbackUsed: boolean;
  cacheHit: boolean;
  /** False for a refusal, an abort or a failure — none of those may cost a student a credit. */
  charged: boolean;
}

export interface EnhanceRun {
  provider: LLMProvider;
  fallback: LLMProvider | null;
  /** The verify-pass model. Usually the same provider; null disables the pass. */
  verifier: LLMProvider | null;
  input: BuildEnhancePromptInput;
  maxTokens: number;
  temperature: number;
  verifyTokens: number;
  /** `app_config.verify_families`. */
  verifyFamilies: string[];
  signal: AbortSignal;
}

interface CallResult {
  text: string;
  usage: ChatUsage | null;
  error: ProviderError | null;
  finishReason: 'stop' | 'length' | 'content-filter' | 'abort' | 'error';
}

/**
 * The draft call, streamed.
 *
 * A generator rather than a callback because the pipeline has to *yield* each delta and each
 * completed section as it arrives — a callback could only collect them for after the call, which
 * is the difference between a note that appears as it is written and a blank screen for forty
 * seconds. The tolerant parser is fed here, at the one place the tokens pass through.
 */
async function* streamCall(
  provider: LLMProvider,
  request: Omit<ChatRequest, 'signal'> & { signal: AbortSignal },
  stream: TolerantJsonStream,
  out: { result: CallResult },
): AsyncGenerator<PipelineEvent> {
  let text = '';
  let usage: ChatUsage | null = null;
  let error: ProviderError | null = null;
  let finishReason: CallResult['finishReason'] = 'stop';

  let announcedKey: string | null = null;

  for await (const chunk of provider.chat(request)) {
    if (chunk.type === 'text') {
      text += chunk.text;
      yield { type: 'delta', text: chunk.text };
      const update = stream.push(chunk.text);
      if (update.head) yield { type: 'head', head: update.head };
      for (const section of update.sections) {
        yield { type: 'section', index: section.index, section: section.section };
      }
      // §7: the narration line is derived from which top-level key is being written. The client
      // could infer some of it from the events above, but not the tail — corrections, the fact
      // check and the study tools all arrive after the last section and would otherwise show as
      // one long silence at the end.
      if (update.currentKey && update.currentKey !== announcedKey) {
        announcedKey = update.currentKey;
        yield { type: 'status', phase: 'generating', key: announcedKey };
      }
    } else if (chunk.type === 'usage') {
      usage = chunk.usage;
    } else if (chunk.type === 'error') {
      error = chunk.error;
    } else if (chunk.type === 'done') {
      finishReason = chunk.finishReason;
    }
  }

  out.result = { text, usage, error, finishReason };
}

/** The non-streamed calls — repair, tidy retry, verify. Nobody watches these arrive. */
async function call(
  provider: LLMProvider,
  request: Omit<ChatRequest, 'signal'> & { signal: AbortSignal },
): Promise<CallResult> {
  let text = '';
  let usage: ChatUsage | null = null;
  let error: ProviderError | null = null;
  let finishReason: CallResult['finishReason'] = 'stop';

  for await (const chunk of provider.chat(request)) {
    if (chunk.type === 'text') text += chunk.text;
    else if (chunk.type === 'usage') usage = chunk.usage;
    else if (chunk.type === 'error') error = chunk.error;
    else if (chunk.type === 'done') finishReason = chunk.finishReason;
  }

  return { text, usage, error, finishReason };
}

class UsageLedger {
  readonly byModel: RunUsage['byModel'] = {};

  add(model: string, usage: ChatUsage | null): void {
    if (!usage) return;
    const entry = (this.byModel[model] ??= { tokensIn: 0, tokensOut: 0, cachedTokensIn: 0 });
    entry.tokensIn += usage.tokensIn;
    entry.tokensOut += usage.tokensOut;
    entry.cachedTokensIn += usage.cachedTokensIn ?? 0;
  }

  totals(): Pick<RunUsage, 'tokensIn' | 'tokensOut' | 'cachedTokensIn'> {
    return Object.values(this.byModel).reduce(
      (total, entry) => ({
        tokensIn: total.tokensIn + entry.tokensIn,
        tokensOut: total.tokensOut + entry.tokensOut,
        cachedTokensIn: total.cachedTokensIn + entry.cachedTokensIn,
      }),
      { tokensIn: 0, tokensOut: 0, cachedTokensIn: 0 },
    );
  }
}

const REPAIR_INSTRUCTION =
  'Return ONLY corrected valid JSON for the schema. Do not change content.';

function repairPrompt(raw: string, issues: ValidationIssue[]): string {
  const rules = issues
    .filter((issue) => issue.severity === 'error')
    .slice(0, 12)
    .map((issue) => `- ${issue.path}: ${issue.message}`)
    .join('\n');
  return [
    REPAIR_INSTRUCTION,
    rules ? `These rules were broken and must be satisfied:\n${rules}` : '',
    'The json to correct follows.',
    raw,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function isRefusal(value: unknown): value is { refused: { reason?: string } } {
  return typeof value === 'object' && value !== null && 'refused' in value;
}

export async function* runEnhance(run: EnhanceRun): AsyncGenerator<PipelineEvent> {
  const ledger = new UsageLedger();
  let provider = run.provider;
  let fallbackUsed = false;

  const prompt = buildEnhancePrompt(run.input);
  yield { type: 'start', provider: provider.id, model: provider.model };
  yield { type: 'status', phase: 'generating' };

  /* 1. The draft, streamed --------------------------------------------------- */
  let stream = new TolerantJsonStream();
  const out: { result: CallResult } = {
    result: { text: '', usage: null, error: null, finishReason: 'stop' },
  };

  const request = {
    system: prompt.system,
    cachePrefix: prompt.cachePrefix,
    messages: prompt.messages,
    json: true,
    maxTokens: run.maxTokens,
    temperature: run.temperature,
    signal: run.signal,
  };

  yield* streamCall(provider, request, stream, out);
  let result = out.result;
  ledger.add(provider.model, result.usage);

  /* 2. Fallback, once -------------------------------------------------------- */
  if (result.error?.retryable && run.fallback && !run.signal.aborted) {
    provider = run.fallback;
    fallbackUsed = true;
    stream = new TolerantJsonStream();
    yield { type: 'reset' };
    yield { type: 'status', phase: 'restarting' };
    yield* streamCall(provider, request, stream, out);
    result = out.result;
    ledger.add(provider.model, result.usage);
  }

  if (run.signal.aborted || result.finishReason === 'abort') {
    yield { type: 'usage', usage: usageOf(ledger, provider, fallbackUsed, false) };
    yield { type: 'error', code: 'aborted', message: 'Generation was cancelled.', resumable: true };
    return;
  }

  if (result.error && !result.text) {
    yield { type: 'usage', usage: usageOf(ledger, provider, fallbackUsed, false) };
    yield {
      type: 'error',
      code: 'provider',
      message: result.error.message,
      resumable: result.error.retryable,
    };
    return;
  }

  /* 3. Parse, with the §8 ladder -------------------------------------------- */
  // The parser holds the last section back while the array is still open, because a half-written
  // element is indistinguishable from a finished one. Releasing it here rather than waiting for
  // the `document` event matters: the verify pass sits between the two and takes seconds.
  const finished = stream.finish();
  for (const section of finished.sections) {
    yield { type: 'section', index: section.index, section: section.section };
  }

  let value: unknown = finished.value;
  if (!isUsable(value)) value = largestValidJson(result.text);

  if (!isUsable(value) && result.text.trim()) {
    yield { type: 'status', phase: 'repairing' };
    const repaired = await call(provider, {
      ...request,
      messages: [{ role: 'user', content: repairPrompt(result.text, []) }],
    });
    ledger.add(provider.model, repaired.usage);
    value = largestValidJson(repaired.text);
  }

  if (!isUsable(value)) {
    // §8 step 3: the simplest schema we have, one more time.
    yield { type: 'status', phase: 'simplifying' };
    const tidy = await call(provider, {
      ...request,
      ...tidyPrompt(run.input),
      maxTokens: Math.min(run.maxTokens, 4000),
    });
    ledger.add(provider.model, tidy.usage);
    value = largestValidJson(tidy.text);
  }

  if (!isUsable(value)) {
    yield { type: 'usage', usage: usageOf(ledger, provider, fallbackUsed, false) };
    yield {
      type: 'error',
      code: 'unparseable',
      message: 'The model did not return a usable study guide.',
      resumable: true,
    };
    return;
  }

  if (isRefusal(value)) {
    yield { type: 'usage', usage: usageOf(ledger, provider, fallbackUsed, false) };
    yield {
      type: 'refused',
      reason: value.refused?.reason ?? 'These do not look like class notes.',
    };
    return;
  }

  /* 4. Validate, repair once, degrade --------------------------------------- */
  let validation = validateNoteDocument(value);
  if (!validation.ok) {
    yield { type: 'status', phase: 'repairing' };
    const repaired = await call(provider, {
      ...request,
      messages: [{ role: 'user', content: repairPrompt(JSON.stringify(value), validation.issues) }],
    });
    ledger.add(provider.model, repaired.usage);
    const reparsed = largestValidJson(repaired.text);
    if (isUsable(reparsed) && !isRefusal(reparsed)) {
      const second = validateNoteDocument(reparsed);
      if (second.document) validation = second;
    }
  }

  if (!validation.document) {
    yield { type: 'usage', usage: usageOf(ledger, provider, fallbackUsed, false) };
    yield {
      type: 'error',
      code: 'empty',
      message: 'The model did not return a usable study guide.',
      resumable: true,
    };
    return;
  }

  let document = validation.document;
  const degraded = !validation.ok;
  if (degraded) document = degradeDocument(document, validation.issues);

  /* 5. Verify, patch, re-validate ------------------------------------------- */
  const family = run.input.context.domainFamily;
  if (
    run.verifier &&
    shouldVerify(run.input.options.mode, family, run.verifyFamilies) &&
    !run.signal.aborted
  ) {
    yield { type: 'status', phase: 'verifying' };
    const verifyPrompt = buildVerifyPrompt({
      syllabusBlock: run.input.packBlock?.text ?? '',
      originalNotes: run.input.extract,
      draftJson: JSON.stringify(document),
      subject: run.input.context.subject,
    });
    const verified = await call(run.verifier, {
      system: verifyPrompt.system,
      cachePrefix: verifyPrompt.cachePrefix,
      messages: verifyPrompt.messages,
      json: true,
      maxTokens: run.verifyTokens,
      temperature: 0,
      signal: run.signal,
    });
    ledger.add(run.verifier.model, verified.usage);

    const parsed = parseVerifyResult(largestValidJson(verified.text));
    if (parsed) {
      const applied = applyPatches(document, parsed);
      const revalidated = validateNoteDocument(applied.document);
      // A verification pass must never be able to make the document worse. If its patches broke a
      // rule the draft satisfied, the draft ships and the failure is a log line, not a note.
      if (revalidated.ok && revalidated.document) document = revalidated.document;
    }
  }

  yield { type: 'status', phase: 'finalising' };
  yield { type: 'document', document, issues: validation.issues, degraded };
  yield { type: 'usage', usage: usageOf(ledger, provider, fallbackUsed, true) };
}

function isUsable(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** §8 step 3 — the same notes, asked for in the simplest mode the schema supports. */
function tidyPrompt(input: BuildEnhancePromptInput) {
  const options: EnhanceOptions = { ...input.options, mode: 'tidy', visuals: 'none' };
  const built = buildEnhancePrompt({ ...input, options });
  return { system: built.system, messages: built.messages, cachePrefix: built.cachePrefix };
}

function usageOf(
  ledger: UsageLedger,
  provider: LLMProvider,
  fallbackUsed: boolean,
  charged: boolean,
): RunUsage {
  const totals = ledger.totals();
  return {
    ...totals,
    byModel: ledger.byModel,
    provider: provider.id,
    model: provider.model,
    fallbackUsed,
    cacheHit: totals.cachedTokensIn > 0,
    charged,
  };
}
