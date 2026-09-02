/**
 * The inline parser, as data rather than as React (06 §1, 06 §2).
 *
 * `inline.tsx` renders these to a React tree; `lib/export/*` renders them to Markdown, to Word
 * runs and to Anki HTML. Both need exactly the same answer to "what does `**a ($x$)**` mean", so
 * there is one parser and two emitters rather than two parsers.
 *
 * Deliberately not a markdown library: the model's output is untrusted text, and the safest parser
 * is one that can only produce the handful of nodes we actually want. There is no HTML path at
 * all — a `<script>` in the model's prose is text, in every emitter.
 *
 * Supported: `$math$` · `$$display$$` · `**bold**` · `*italic*` / `_italic_` · `` `code` `` ·
 * `[text](url)`. Everything else is text. Block structure belongs to the NoteDocument.
 */

export type InlineToken =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'math'; latex: string; display: boolean }
  /** `text` is not parsed further, which matches what the renderer has always done. */
  | { kind: 'link'; href: string; text: string }
  | { kind: 'bold'; children: InlineToken[] }
  | { kind: 'italic'; children: InlineToken[] };

const DISPLAY_MATH = /(?<!\\)\$\$([\s\S]+?)(?<!\\)\$\$/;
const MATH = /(?<!\\)\$([^$]+?)(?<!\\)\$/;
const CODE = /`([^`]+?)`/;
const BOLD = /\*\*([^*]+?)\*\*/;
const ITALIC = /(?:\*([^*]+?)\*|_([^_]+?)_)/;
const LINK = /\[([^\]]+?)\]\(([^)\s]+)\)/;

/** http(s) and mailto only. Anything else — `javascript:`, `data:` — is not a link at all. */
export function safeHref(href: string): string | null {
  try {
    const url = new URL(href, 'https://lumen.invalid');
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? href : null;
  } catch {
    return null;
  }
}

/**
 * Constructs are tried by *position*, not by priority.
 *
 * Priority order was the obvious first attempt and it is wrong: with math checked first,
 * `**mass-to-charge ratio ($m/z$)**` splits on the maths and the two halves of the `**` pair end
 * up in different segments, so the bold never closes. Taking whichever construct starts earliest
 * gets both cases right — bold wins there because it starts at index 0, and `$\text{a **b**}$`
 * still parses as maths because the `$` does.
 *
 * Ties go to whichever is listed first, which is why display maths precedes inline maths: at the
 * same index, `$$` is the longer and more specific match.
 */
const CONSTRUCTS: {
  pattern: RegExp;
  build: (match: RegExpExecArray) => InlineToken;
}[] = [
  {
    pattern: DISPLAY_MATH,
    build: (match) => ({ kind: 'math', latex: match[1]!, display: true }),
  },
  { pattern: MATH, build: (match) => ({ kind: 'math', latex: match[1]!, display: false }) },
  { pattern: CODE, build: (match) => ({ kind: 'code', text: match[1]! }) },
  {
    pattern: LINK,
    build: (match) => {
      const href = safeHref(match[2]!);
      // An unsafe href is not a broken link, it is not a link: the whole run stays as characters.
      return href ? { kind: 'link', href, text: match[1]! } : { kind: 'text', text: match[0] };
    },
  },
  { pattern: BOLD, build: (match) => ({ kind: 'bold', children: tokenizeInline(match[1]!) }) },
  {
    pattern: ITALIC,
    build: (match) => ({ kind: 'italic', children: tokenizeInline(match[1] ?? match[2]!) }),
  },
];

export function tokenizeInline(text: string): InlineToken[] {
  if (!text) return [];

  let earliest: { match: RegExpExecArray; build: (m: RegExpExecArray) => InlineToken } | null =
    null;

  for (const construct of CONSTRUCTS) {
    const match = construct.pattern.exec(text);
    if (match && (!earliest || match.index < earliest.match.index)) {
      earliest = { match, build: construct.build };
    }
  }

  if (!earliest) return [{ kind: 'text', text }];

  const { match, build } = earliest;
  return [
    ...tokenizeInline(text.slice(0, match.index)),
    build(match),
    ...tokenizeInline(text.slice(match.index + match[0].length)),
  ];
}
