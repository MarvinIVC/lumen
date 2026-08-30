/**
 * Tolerant streaming JSON (04-AI-ENGINE.md §7).
 *
 * The model emits one large JSON object token by token; the note has to appear section by section
 * while it does. So this scans the buffer as it grows, remembers the last point at which a value
 * was structurally complete, and — on demand — closes the containers open at that point to make a
 * parseable prefix. Nothing is ever parsed twice and no exception is thrown on the way.
 *
 * Hand-rolled rather than `partial-json` or `best-effort-json-parser`, for the reason phase-02
 * recorded and phase-03 followed: everything expensive on `/app` is reachable through very few
 * modules, the Worker sits inside a hard 3 MiB ceiling, and this is ~200 lines with no transitive
 * dependencies. It also has to run in Deno inside the edge function, where an npm specifier is one
 * more thing that can fail at deploy time rather than at typecheck time.
 *
 * A section is only handed on once the *next* one has started, because the last element of an
 * array that is still open is by definition unfinished. `finish()` releases the tail.
 */

/** What `push` learned from the bytes that just arrived. */
export interface ParseUpdate {
  /** Sections that became complete during this push, in order. */
  sections: { index: number; section: unknown }[];
  /** The document head, the first time it is all there. Null on every later push. */
  head: { title: unknown; summary: unknown; objectives: unknown } | null;
  /** The top-level key currently being written — what the narration line is derived from. */
  currentKey: string | null;
}

interface Frame {
  kind: '{' | '[';
  /** Objects alternate key and value; a closing quote means different things in each position. */
  expectKey: boolean;
}

interface Snapshot {
  /** Index just past the last complete value. */
  index: number;
  /** The containers open at that index, outermost first. */
  stack: ('{' | '[')[];
}

const EMPTY: ParseUpdate = { sections: [], head: null, currentKey: null };

export class TolerantJsonStream {
  private buffer = '';
  private cursor = 0;
  private frames: Frame[] = [];
  private inString = false;
  private escaped = false;
  private snapshot: Snapshot | null = null;
  private snapshotAt = -1;
  private topKey: string | null = null;
  private pendingKey = '';
  private sectionsSent = 0;
  private headSent = false;

  get raw(): string {
    return this.buffer;
  }

  get key(): string | null {
    return this.topKey;
  }

  push(chunk: string): ParseUpdate {
    if (!chunk) return EMPTY;
    this.buffer += chunk;
    this.scan();
    if (this.snapshotAt < 0) return { sections: [], head: null, currentKey: this.topKey };

    const partial = this.parseSnapshot();
    if (!partial) return { sections: [], head: null, currentKey: this.topKey };

    return {
      sections: this.takeSections(partial, false),
      head: this.takeHead(partial),
      currentKey: this.topKey,
    };
  }

  /**
   * The stream is over. Returns the whole document if it parsed, and in either case releases the
   * sections that were still being held back.
   */
  finish(): { ok: boolean; value: unknown; sections: { index: number; section: unknown }[] } {
    let value: unknown;
    let ok = false;
    try {
      value = JSON.parse(this.buffer.trim());
      ok = true;
    } catch {
      value = this.parseSnapshot() ?? largestValidJson(this.buffer);
    }
    const sections = isRecord(value) ? this.takeSections(value, true) : [];
    return { ok, value, sections };
  }

  /* ---------------------------------------------------------------------- */

  private scan(): void {
    for (let i = this.cursor; i < this.buffer.length; i += 1) {
      const char = this.buffer.charAt(i);

      if (this.inString) {
        if (this.escaped) {
          this.escaped = false;
        } else if (char === '\\') {
          this.escaped = true;
        } else if (char === '"') {
          this.inString = false;
          const frame = this.frames[this.frames.length - 1];
          if (frame?.kind === '{' && frame.expectKey) {
            // A key, not a value: remember it, and note it when it is a top-level key.
            if (this.frames.length === 1) this.topKey = this.pendingKey;
            this.pendingKey = '';
            frame.expectKey = false;
          } else {
            this.complete(i + 1);
          }
        } else if (
          this.frames[this.frames.length - 1]?.kind === '{' &&
          this.frames[this.frames.length - 1]?.expectKey
        ) {
          this.pendingKey += char;
        }
        continue;
      }

      switch (char) {
        case '"':
          this.inString = true;
          break;
        case '{':
        case '[':
          this.frames.push({ kind: char, expectKey: char === '{' });
          break;
        case '}':
        case ']':
          this.frames.pop();
          this.complete(i + 1);
          break;
        case ',': {
          const frame = this.frames[this.frames.length - 1];
          if (frame?.kind === '{') frame.expectKey = true;
          break;
        }
        case ':':
          break;
        default:
          // Numbers, true, false and null complete at the delimiter that follows them, which is
          // one of the cases above — so the snapshot after a scalar is taken there.
          break;
      }
    }
    this.cursor = this.buffer.length;
  }

  private complete(index: number): void {
    this.snapshot = { index, stack: this.frames.map((frame) => frame.kind) };
    this.snapshotAt = index;
  }

  private parsedAt = -1;
  private parsed: Record<string, unknown> | null = null;

  private parseSnapshot(): Record<string, unknown> | null {
    if (!this.snapshot) return null;
    if (this.snapshot.index === this.parsedAt) return this.parsed;

    const closers = this.snapshot.stack
      .slice()
      .reverse()
      .map((kind) => (kind === '{' ? '}' : ']'))
      .join('');
    const candidate = `${this.buffer.slice(0, this.snapshot.index)}${closers}`;

    this.parsedAt = this.snapshot.index;
    try {
      const value: unknown = JSON.parse(candidate);
      this.parsed = isRecord(value) ? value : null;
    } catch {
      this.parsed = null;
    }
    return this.parsed;
  }

  private takeSections(partial: Record<string, unknown>, final: boolean): ParseUpdate['sections'] {
    const sections = Array.isArray(partial.sections) ? partial.sections : [];
    // While the array is still growing, the last element is by definition half-written.
    const available = final ? sections.length : Math.max(0, sections.length - 1);
    const out: ParseUpdate['sections'] = [];
    for (let index = this.sectionsSent; index < available; index += 1) {
      out.push({ index, section: sections[index] });
    }
    this.sectionsSent = Math.max(this.sectionsSent, available);
    return out;
  }

  private takeHead(partial: Record<string, unknown>): ParseUpdate['head'] {
    if (this.headSent) return null;
    // The head is complete once the model has moved past it — `sections` having started is the
    // signal, and it is a more reliable one than any individual key being non-empty.
    if (!Array.isArray(partial.sections)) return null;
    this.headSent = true;
    return {
      title: partial.title,
      summary: partial.summary,
      objectives: partial.objectives,
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * §8 step 2 — "try extracting the largest valid JSON substring".
 *
 * Models wrap JSON in a markdown fence, apologise before it, or add a sentence after it far more
 * often than they emit genuinely malformed JSON, so this is worth trying before the expensive
 * repair round trip. It looks for the outermost brace pair and walks the closing brace inwards.
 */
export function largestValidJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = (fenced?.[1] ?? text).trim();

  const start = body.indexOf('{');
  if (start < 0) return undefined;

  for (let end = body.lastIndexOf('}'); end > start; end = body.lastIndexOf('}', end - 1)) {
    try {
      return JSON.parse(body.slice(start, end + 1));
    } catch {
      // Keep walking inwards; a trailing apology is the common case and costs one attempt.
    }
  }
  return undefined;
}

/** One-shot tolerant parse, for tests and for the repair path. */
export function parsePartialJson(text: string): unknown {
  const stream = new TolerantJsonStream();
  stream.push(text);
  return stream.finish().value;
}
