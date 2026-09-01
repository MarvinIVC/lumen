'use client';

/**
 * The browser half of "regenerate this section" (phase-05 §10).
 *
 * Same endpoint as a full generation, same refusal handling, one extra field on the body. What is
 * different is what the caller does with the result: nothing is applied. The fragment comes back,
 * the workspace diffs it against what is on screen, and the student decides. A regenerate that
 * silently replaced a section the moment it arrived would be a quarter-credit gamble on text they
 * had already read and might have preferred.
 */
import { clientEnv } from '@/lib/env';
import { anonHeaders, captureAnonId } from './anon-id';
import { byokRequest, readByok } from './byok-store';
import { EnhanceRefused, readEventStream, refusalFrom } from './sse-client';
import { enhanceEndpoint } from './enhance-client';
import type { EnhanceOptions, NoteContext, Section } from './schema';
import type { RegenFragment } from './regen';

export interface RegenerateRequest {
  context: NoteContext;
  options: EnhanceOptions;
  /** The original extracted notes — the model needs what the student actually wrote. */
  extract: string;
  section: Section;
  instruction?: string;
  turnstileToken?: string | null;
  signal?: AbortSignal;
}

export interface RegenerateHandlers {
  onStatus?: (status: string) => void;
  onFragment?: (fragment: RegenFragment) => void;
  onUsage?: (usage: { credits: number; costCny: number | null; model: string }) => void;
  onError?: (error: { code: string; message: string }) => void;
}

const STATUS: Record<string, string> = {
  generating: 'Rewriting this section…',
  repairing: 'Tidying up the result…',
  finalising: 'Almost there…',
};

/**
 * Runs one scoped regeneration. Resolves when the stream ends, however it ends.
 *
 * Throws only `EnhanceRefused`, and only before anything has streamed — identical to
 * `streamEnhance`, because it is the identical guardrail on the identical endpoint.
 */
export async function streamRegenerate(
  request: RegenerateRequest,
  handlers: RegenerateHandlers,
): Promise<void> {
  const body = {
    context: request.context,
    options: request.options,
    extract: request.extract,
    scope: {
      sectionId: request.section.id,
      sectionTitle: request.section.title,
      // The section as it stands, so the model is improving on something rather than guessing at
      // what the heading meant. Block ids go with it — they are small, and a model that sees them
      // is less likely to invent a shape we would have to strip.
      currentSection: JSON.stringify(request.section),
      ...(request.instruction?.trim() ? { instruction: request.instruction.trim() } : {}),
    },
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
  if (!response.ok || !response.body) throw new EnhanceRefused(await refusalFrom(response));

  // Same reasoning as `streamEnhance`: a stream can simply stop — a dropped connection, a closed
  // laptop — and nothing throws when it does. Without a concluding event the run did not finish,
  // and the section on screen stays exactly as it was.
  let concluded = false;

  await readEventStream(
    response.body,
    (event, data) => {
      switch (event) {
        case 'status': {
          const { phase } = data as { phase: string };
          handlers.onStatus?.(STATUS[phase] ?? STATUS.generating!);
          break;
        }
        case 'fragment':
          concluded = true;
          handlers.onFragment?.((data as { fragment: RegenFragment }).fragment);
          break;
        case 'usage':
          handlers.onUsage?.(data as { credits: number; costCny: number | null; model: string });
          break;
        case 'error':
          concluded = true;
          handlers.onError?.(data as { code: string; message: string });
          break;
        default:
          break;
      }
    },
    request.signal,
  );

  if (!concluded && !request.signal?.aborted) {
    handlers.onError?.({
      code: 'interrupted',
      message: 'The connection dropped part-way through. Your section is untouched — try again.',
    });
  }
}
