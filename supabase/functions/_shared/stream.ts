/**
 * SSE plumbing for the functions that stream.
 *
 * The frame writer itself is `lib/ai/providers/sse.ts` — the same one the providers are read with,
 * because a bug in how a payload containing a newline is framed should be impossible to have on
 * only one side of the connection.
 */
import { sseFrame } from '../../../lib/ai/providers/sse.ts';
import { corsHeaders } from './cors.ts';

export interface SseWriter {
  send(event: string, data: unknown): void;
  close(): void;
}

export function sseResponse(
  request: Request,
  extraHeaders: Record<string, string>,
  produce: (writer: SseWriter) => Promise<void>,
): Response {
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const writer: SseWriter = {
        send(event, data) {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(sseFrame(event, data)));
          } catch {
            // The client hung up mid-stream. Not an error: the pipeline's own abort signal is
            // what stops the spending, and it is already wired to the request.
            closed = true;
          }
        },
        close() {
          if (closed) return;
          closed = true;
          controller.close();
        },
      };

      try {
        await produce(writer);
      } catch (cause) {
        console.error('stream failed', cause);
        writer.send('error', {
          code: 'internal',
          message: 'Something went wrong on our side.',
          resumable: true,
        });
      } finally {
        writer.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      ...corsHeaders(request),
      ...extraHeaders,
    },
  });
}
