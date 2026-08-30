'use client';

/**
 * The browser half of generation (04-AI-ENGINE.md §7).
 *
 * It opens the SSE stream, keeps a partial `NoteDocument` up to date as sections land, and hands
 * the caller a narration line. Three things it deliberately does not do:
 *
 *   It does not parse the model's raw tokens. The `delta` events go past unused — the *server*
 *   runs the tolerant parser and sends whole sections, because the same parse has to feed the
 *   validator, the verify pass and the ledger, and two implementations of it would drift.
 *   (`lib/ai/stream-parse.ts` is still shared: the server imports it, and so does the eval suite.)
 *
 *   It does not decide what a partial document means. `document` is authoritative and replaces
 *   whatever the reveal built, because the verify pass can change the text after the fact.
 *
 *   It does not throw. Every failure arrives as an `error` event with a message written for a
 *   student, because there is no screen here where a stack trace would help.
 */
import { clientEnv } from '@/lib/env';
import { anonHeaders, captureAnonId } from './anon-id';
import { byokRequest, readByok } from './byok-store';
import { SCHEMA_VERSION, PROMPT_VERSION } from './versions';
import type { EnhanceOptions, NoteContext, NoteDocument, Section } from './schema';

export type GenerationPhase =
  'generating' | 'restarting' | 'repairing' | 'simplifying' | 'verifying' | 'finalising';

export interface StreamUsage {
  tokensIn: number;
  tokensOut: number;
  cachedTokensIn: number;
  cacheHit: boolean;
  fallbackUsed: boolean;
  costCny: number | null;
  credits: number;
  model: string;
  provider: string;
}

export interface QuotaRefusal {
  reason:
    'kill-switch' | 'monthly-cap' | 'daily-cap' | 'quota' | 'rate-limited' | 'too_large' | string;
  message: string;
  resetsAt: string | null;
  byokHelps: boolean;
}

export interface EnhanceHandlers {
  onStatus?: (status: string, phase: GenerationPhase) => void;
  /** The document so far. Called on every head, section and reset. */
  onPartial?: (document: NoteDocument) => void;
  onDocument?: (document: NoteDocument, degraded: boolean) => void;
  onRefused?: (reason: string) => void;
  onUsage?: (usage: StreamUsage) => void;
  onError?: (error: { code: string; message: string; resumable: boolean }) => void;
}

export interface EnhanceRequest {
  context: NoteContext;
  options: EnhanceOptions;
  extract: string;
  titleHint?: string;
  kind?: 'enhance' | 'regen';
  turnstileToken?: string | null;
  signal?: AbortSignal;
}

export function enhanceEndpoint(): string {
  return new URL('/functions/v1/enhance', clientEnv.NEXT_PUBLIC_SUPABASE_URL).toString();
}

/* -------------------------------------------------------------------------- *
 * Narration (§7)
 * -------------------------------------------------------------------------- */

/** Which top-level key the model is writing, in the student's words rather than the schema's. */
const KEY_NARRATION: Record<string, string> = {
  title: 'Reading your notes…',
  summary: 'Working out what this lesson is about…',
  objectives: 'Setting out what you should be able to do…',
  sections: 'Rebuilding your lesson…',
  corrections: 'Noting what to relearn…',
  openQuestions: 'Listing what to check with your teacher…',
  factCheck: 'Checking the calculations…',
  studyTools: 'Writing flashcards and a quiz…',
  glossary: 'Collecting the key terms…',
  furtherStudy: 'Deciding what comes next…',
};

const PHASE_NARRATION: Record<GenerationPhase, string> = {
  generating: 'Rebuilding your lesson…',
  restarting: 'That model was busy — starting again on another…',
  repairing: 'Tidying up the result…',
  simplifying: 'Trying a simpler shape…',
  verifying: 'Checking it against the syllabus…',
  finalising: 'Almost there…',
};

export function narrate(phase: GenerationPhase, key: string | null): string {
  if (phase !== 'generating') return PHASE_NARRATION[phase];
  return (key && KEY_NARRATION[key]) || PHASE_NARRATION.generating;
}

/* -------------------------------------------------------------------------- *
 * The partial document
 * -------------------------------------------------------------------------- */

export function emptyDocument(
  context: NoteContext,
  options: EnhanceOptions,
  title: string,
): NoteDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    promptVersion: PROMPT_VERSION,
    title,
    context,
    options,
    summary: '',
    objectives: [],
    sections: [],
    corrections: [],
    openQuestions: [],
    factCheck: { calculationsVerified: [], checkedClaims: 0, flags: [] },
    studyTools: { flashcards: [], quiz: [] },
    glossary: [],
  };
}

/* -------------------------------------------------------------------------- *
 * The stream
 * -------------------------------------------------------------------------- */

export class EnhanceRefused extends Error {
  constructor(readonly refusal: QuotaRefusal) {
    super(refusal.message);
    this.name = 'EnhanceRefused';
  }
}

/**
 * Runs one generation. Resolves when the stream ends, however it ends.
 *
 * Throws only `EnhanceRefused`, and only before anything has streamed — a guardrail refusal is an
 * HTTP status with a JSON body, so the caller can show the quota card without having to unpick an
 * event stream that never started.
 */
export async function streamEnhance(
  request: EnhanceRequest,
  handlers: EnhanceHandlers,
): Promise<void> {
  const body = {
    context: request.context,
    options: request.options,
    extract: request.extract,
    ...(request.titleHint ? { titleHint: request.titleHint } : {}),
    kind: request.kind ?? 'enhance',
    turnstileToken: request.turnstileToken ?? null,
    byok: byokRequest(readByok()),
  };

  const response = await fetch(enhanceEndpoint(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      ...anonHeaders(),
    },
    body: JSON.stringify(body),
    ...(request.signal ? { signal: request.signal } : {}),
  });

  captureAnonId(response);

  if (!response.ok || !response.body) {
    let refusal: QuotaRefusal = {
      reason: 'error',
      message: 'We could not reach the study-guide service. Your notes are safe on this device.',
      resetsAt: null,
      byokHelps: false,
    };
    try {
      const parsed = (await response.json()) as Partial<QuotaRefusal> & { error?: string };
      refusal = {
        reason: parsed.reason ?? parsed.error ?? 'error',
        message: parsed.message ?? refusal.message,
        resetsAt: parsed.resetsAt ?? null,
        byokHelps: parsed.byokHelps ?? false,
      };
    } catch {
      // A gateway error page rather than our JSON. The default message is the honest one.
    }
    throw new EnhanceRefused(refusal);
  }

  let document = emptyDocument(request.context, request.options, request.titleHint ?? '');
  const sections = new Map<number, Section>();
  let key: string | null = null;

  const publish = () => {
    document = {
      ...document,
      sections: [...sections.entries()].sort((a, b) => a[0] - b[0]).map(([, section]) => section),
    };
    handlers.onPartial?.(document);
  };

  await readEventStream(
    response.body,
    (event, data) => {
      switch (event) {
        case 'status': {
          const payload = data as { phase: GenerationPhase; key?: string | null };
          if (payload.key !== undefined) key = payload.key;
          handlers.onStatus?.(narrate(payload.phase, key), payload.phase);
          break;
        }
        case 'head': {
          const { head } = data as {
            head: { title?: string; summary?: string; objectives?: string[] };
          };
          document = {
            ...document,
            title: head.title || document.title,
            summary: head.summary ?? '',
            objectives: Array.isArray(head.objectives) ? head.objectives : [],
          };
          publish();
          break;
        }
        case 'section': {
          const { index, section } = data as { index: number; section: Section };
          sections.set(index, section);
          publish();
          break;
        }
        case 'reset': {
          // The fallback provider is starting from nothing; so must the reveal.
          sections.clear();
          document = emptyDocument(request.context, request.options, request.titleHint ?? '');
          publish();
          break;
        }
        case 'document': {
          const { document: finished, degraded } = data as {
            document: NoteDocument;
            degraded: boolean;
          };
          // The server's copy is authoritative: it has been validated, and the verify pass may have
          // changed text the reveal already showed.
          handlers.onDocument?.(
            { ...finished, context: request.context, options: request.options },
            degraded,
          );
          break;
        }
        case 'refused':
          handlers.onRefused?.((data as { reason: string }).reason);
          break;
        case 'usage':
          handlers.onUsage?.(data as StreamUsage);
          break;
        case 'error':
          handlers.onError?.(data as { code: string; message: string; resumable: boolean });
          break;
        default:
          break;
      }
    },
    request.signal,
  );
}

/**
 * Reads `text/event-stream` off a fetch body.
 *
 * A separate, smaller reader from `lib/ai/providers/sse.ts` on purpose: that one is for talking to
 * providers and runs on the server, and importing it here would pull the provider modules into the
 * client graph — which `tests/unit/no-client-secrets.test.ts` exists to prevent.
 */
async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: string, data: unknown) => void,
  signal?: AbortSignal,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        emit(buffer.slice(0, boundary), onEvent);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
      }
    }
    if (buffer.trim()) emit(buffer, onEvent);
  } catch {
    // An aborted read is how "Cancel" is implemented. Anything else has already been reported by
    // the server as an `error` event, or is a dropped connection the caller sees as a stalled run.
  } finally {
    reader.releaseLock();
  }
}

function emit(frame: string, onEvent: (event: string, data: unknown) => void): void {
  let name: string | null = null;
  const data: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith('event: ')) name = line.slice(7).trim();
    else if (line.startsWith('data: ')) data.push(line.slice(6));
  }
  if (!name) return;
  try {
    onEvent(name, data.length > 0 ? JSON.parse(data.join('\n')) : null);
  } catch {
    // A frame we cannot parse is a frame we ignore; the `document` event is what matters and it
    // either arrives whole or not at all.
  }
}
