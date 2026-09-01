'use client';

/**
 * The browser half of "ask about this" (phase-05 §11).
 *
 * The smallest client in the product, and the only one whose result is not a document. It hands
 * back prose; what happens to it — margin note, new paragraph, read and dismissed — is the
 * student's decision, made after they have read it. That ordering is the feature: an answer that
 * inserted itself would make asking a question an edit.
 */
import { anonHeaders, captureAnonId } from './anon-id';
import { byokRequest, readByok } from './byok-store';
import { EnhanceRefused, readEventStream, refusalFrom } from './sse-client';

export interface AskRequest {
  selection: string;
  question: string;
  sectionText?: string;
  course: string;
  curriculum: string;
  language: string;
  turnstileToken?: string | null;
  signal?: AbortSignal;
}

export interface AskHandlers {
  /** The answer as it is written. */
  onDelta?: (text: string) => void;
  onAnswer?: (text: string) => void;
  onUsage?: (usage: { credits: number; costCny: number | null; model: string }) => void;
  onError?: (error: { code: string; message: string }) => void;
}

export function askEndpoint(): string {
  return '/api/ai/ask';
}

export async function streamAsk(request: AskRequest, handlers: AskHandlers): Promise<void> {
  const response = await fetch(askEndpoint(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...anonHeaders(),
    },
    body: JSON.stringify({
      selection: request.selection,
      question: request.question,
      ...(request.sectionText ? { sectionText: request.sectionText } : {}),
      course: request.course,
      curriculum: request.curriculum,
      language: request.language,
      turnstileToken: request.turnstileToken ?? null,
      byok: byokRequest(readByok()),
    }),
    ...(request.signal ? { signal: request.signal } : {}),
  });

  captureAnonId(response);
  if (!response.ok || !response.body) throw new EnhanceRefused(await refusalFrom(response));

  let concluded = false;

  await readEventStream(
    response.body,
    (event, data) => {
      switch (event) {
        case 'delta':
          handlers.onDelta?.((data as { text: string }).text);
          break;
        case 'answer':
          concluded = true;
          handlers.onAnswer?.((data as { text: string }).text);
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
      message: 'The connection dropped before the answer arrived. Try asking again.',
    });
  }
}
