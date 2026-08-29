import { Fragment } from 'react';
import type { ReactNode } from 'react';

import { InlineMath } from '../math/inline-math';
import { stripInline } from './strip';

export { stripInline };

/**
 * The restricted inline renderer (06 §1). Deliberately not a markdown library: the model's output
 * is untrusted text, and the safest parser is one that can only produce the handful of nodes we
 * actually want. There is no HTML path at all — a `<script>` in the model's prose renders as the
 * literal characters, because nothing here ever sets innerHTML.
 *
 * Supported: `$math$` · `**bold**` · `*italic*` / `_italic_` · `` `code` `` · `[text](url)`.
 * Everything else is text. Block structure (paragraphs, lists, headings) belongs to the
 * NoteDocument, not to markdown syntax.
 */

const DISPLAY_MATH = /(?<!\\)\$\$([\s\S]+?)(?<!\\)\$\$/;
const MATH = /(?<!\\)\$([^$]+?)(?<!\\)\$/;
const CODE = /`([^`]+?)`/;
const BOLD = /\*\*([^*]+?)\*\*/;
const ITALIC = /(?:\*([^*]+?)\*|_([^_]+?)_)/;
const LINK = /\[([^\]]+?)\]\(([^)\s]+)\)/;

/** http(s) and mailto only. Anything else — `javascript:`, `data:` — renders as plain text. */
function safeHref(href: string): string | null {
  try {
    const url = new URL(href, 'https://lumen.invalid');
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? href : null;
  } catch {
    return null;
  }
}

export function renderInline(text: string, keyPrefix = 'i'): ReactNode {
  return <Fragment key={keyPrefix}>{parse(text, keyPrefix)}</Fragment>;
}

/**
 * Builders for each construct, tried by *position* rather than by priority.
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
  build: (match: RegExpExecArray, key: string) => ReactNode;
}[] = [
  {
    pattern: DISPLAY_MATH,
    build: (match, key) => <InlineMath key={`${key}-dmath`} latex={match[1]!} display />,
  },
  {
    pattern: MATH,
    build: (match, key) => <InlineMath key={`${key}-math`} latex={match[1]!} />,
  },
  {
    pattern: CODE,
    build: (match, key) => (
      <code
        key={`${key}-code`}
        className="rounded-note bg-bg-sunken px-1 py-0.5 font-mono text-inline"
      >
        {match[1]}
      </code>
    ),
  },
  {
    pattern: LINK,
    build: (match, key) => {
      const href = safeHref(match[2]!);
      return href ? (
        <a
          key={`${key}-link`}
          href={href}
          rel="noopener noreferrer"
          className="underline decoration-link/40 underline-offset-2 hover:decoration-link"
        >
          {match[1]}
        </a>
      ) : (
        <Fragment key={`${key}-link`}>{match[0]}</Fragment>
      );
    },
  },
  {
    pattern: BOLD,
    build: (match, key) => (
      <strong key={`${key}-b`} className="font-semibold">
        {parse(match[1]!, `${key}-b`)}
      </strong>
    ),
  },
  {
    pattern: ITALIC,
    build: (match, key) => <em key={`${key}-e`}>{parse(match[1] ?? match[2]!, `${key}-e`)}</em>,
  },
];

function parse(text: string, key: string): ReactNode[] {
  if (!text) return [];

  let earliest: {
    match: RegExpExecArray;
    build: (m: RegExpExecArray, k: string) => ReactNode;
  } | null = null;

  for (const construct of CONSTRUCTS) {
    const match = construct.pattern.exec(text);
    if (match && (!earliest || match.index < earliest.match.index)) {
      earliest = { match, build: construct.build };
    }
  }

  if (!earliest) return [text];
  return splice(text, earliest.match, key, (match) => earliest!.build(match, key));
}

/** Replaces the matched run with `build(match)` and keeps parsing what is on either side. */
function splice(
  text: string,
  match: RegExpExecArray,
  key: string,
  build: (match: RegExpExecArray) => ReactNode,
): ReactNode[] {
  const before = text.slice(0, match.index);
  const after = text.slice(match.index + match[0].length);
  return [...parse(before, `${key}-<`), build(match), ...parse(after, `${key}->`)];
}

/**
 * A speakable version of a string that may be mostly maths.
 *
 * KaTeX emits MathML for screen readers, which is the right thing on a page — but it is *inside*
 * the element, and an accessible name computed from contents does not reach into it. A control
 * whose entire label is an equation therefore ends up with no name at all. Where a name is needed
 * as an attribute rather than as content, this is what to pass.
 *
 * It is not a LaTeX-to-speech engine and does not try to be: it turns the handful of constructs
 * that actually appear in a chemistry note into something a screen reader can pronounce, and
 * drops the rest rather than spelling out backslashes.
 */
export function toSpokenText(text: string): string {
  return stripInline(text)
    .replace(/\\ce\{([^}]*)\}/g, '$1')
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\d?frac\{([^}]*)\}\{([^}]*)\}/g, '$1 over $2')
    .replace(/\\times/g, ' × ')
    .replace(/\\approx/g, ' approximately ')
    .replace(/\^\{?(-?[\dA-Za-z+-]+)\}?/g, ' to the power $1')
    .replace(/_\{?(-?[\dA-Za-z+-]+)\}?/g, ' $1')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[{}\\$]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
