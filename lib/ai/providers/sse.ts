/**
 * Server-sent events, read off a `fetch` response body.
 *
 * Every provider we talk to streams over SSE (Gemini included, with `alt=sse`), and every one of
 * them puts the pieces we need in `data:` lines, so one reader serves all four. It has to run in
 * Node 22 under vitest, in Deno inside the edge function and — for the client half — in a browser,
 * which rules out anything from `node:stream`.
 *
 * Frames are separated by a blank line and a frame's `data:` lines are joined with newlines, which
 * matters: a JSON payload containing a newline arrives split across two `data:` lines.
 */
export interface SseFrame {
  event: string | null;
  data: string;
}

export async function* readSse(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SseFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separator = nextSeparator(buffer);
      while (separator) {
        const raw = buffer.slice(0, separator.index);
        buffer = buffer.slice(separator.index + separator.length);
        const frame = parseFrame(raw);
        if (frame) yield frame;
        separator = nextSeparator(buffer);
      }
    }
    const tail = parseFrame(buffer);
    if (tail) yield tail;
  } finally {
    // Releasing the lock lets the caller cancel the body; without it an aborted generation keeps
    // the socket open until the provider gives up on us.
    reader.releaseLock();
  }
}

function nextSeparator(buffer: string): { index: number; length: number } | null {
  const lf = buffer.indexOf('\n\n');
  const crlf = buffer.indexOf('\r\n\r\n');
  if (lf < 0 && crlf < 0) return null;
  if (crlf >= 0 && (lf < 0 || crlf < lf)) return { index: crlf, length: 4 };
  return { index: lf, length: 2 };
}

function parseFrame(raw: string): SseFrame | null {
  const lines = raw.split(/\r?\n/);
  let event: string | null = null;
  const data: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }

  if (data.length === 0 && event === null) return null;
  return { event, data: data.join('\n') };
}

/** Writes SSE frames — used by the edge function to stream to the client. */
export function sseFrame(event: string, data: unknown): string {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  // A payload containing a newline has to be split across `data:` lines or the frame is truncated
  // at the first one — the same rule the reader above relies on.
  const lines = payload.split('\n').map((line) => `data: ${line}`);
  return `event: ${event}\n${lines.join('\n')}\n\n`;
}
