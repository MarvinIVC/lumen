import { Fragment } from 'react';
import type { ReactNode } from 'react';

import { InlineMath } from '../math/inline-math';
import { stripInline } from './strip';
import { tokenizeInline } from './tokens';
import type { InlineToken } from './tokens';

export { stripInline };

/**
 * The restricted inline renderer (06 §1) — the React emitter for `tokens.ts`.
 *
 * The parsing rules live in `tokens.ts` because phase-07's exporters need the same answers, and
 * two parsers would drift on exactly the input that is hardest to notice: a bold run with maths
 * inside it. Nothing here sets innerHTML, so a `<script>` in the model's prose renders as the
 * literal characters.
 */
export function renderInline(text: string, keyPrefix = 'i'): ReactNode {
  return <Fragment key={keyPrefix}>{emit(tokenizeInline(text), keyPrefix)}</Fragment>;
}

function emit(tokens: InlineToken[], key: string): ReactNode[] {
  return tokens.map((token, index) => node(token, `${key}-${index}`));
}

function node(token: InlineToken, key: string): ReactNode {
  switch (token.kind) {
    case 'text':
      return <Fragment key={key}>{token.text}</Fragment>;
    case 'math':
      return (
        <InlineMath key={key} latex={token.latex} {...(token.display ? { display: true } : {})} />
      );
    case 'code':
      return (
        <code key={key} className="rounded-note bg-bg-sunken px-1 py-0.5 font-mono text-inline">
          {token.text}
        </code>
      );
    case 'link':
      return (
        <a
          key={key}
          href={token.href}
          rel="noopener noreferrer"
          className="underline decoration-link/40 underline-offset-2 hover:decoration-link"
        >
          {token.text}
        </a>
      );
    case 'bold':
      return (
        <strong key={key} className="font-semibold">
          {emit(token.children, key)}
        </strong>
      );
    case 'italic':
      return <em key={key}>{emit(token.children, key)}</em>;
  }
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
