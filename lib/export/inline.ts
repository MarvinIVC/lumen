/**
 * Inline text, out of the tokenizer and into each format (06 §2).
 *
 * **Student-written text is emitted verbatim.** This is phase-05's open question, resolved here
 * rather than in the renderer: `renderInline` treats a student's `*` as emphasis, so a note that
 * says `the * marks the limiting reagent` loses the asterisk. On screen that is a cosmetic bug
 * with a visible original one toggle away. In an exported file it is permanent, and in Markdown it
 * is worse than permanent — Obsidian re-applies the same rule to the same characters, so the
 * damage compounds every time the file is opened. Student origin therefore escapes rather than
 * parses, in every format. The renderer is deliberately left alone: changing it changes how every
 * existing note looks on screen, which is not this phase's business.
 */
import { tokenizeInline } from '@/lib/render/markdown/tokens';
import type { InlineToken } from '@/lib/render/markdown/tokens';
import type { Origin } from '@/lib/ai/schema';

/** True when the text is the student's own words and must survive byte for byte. */
export function isStudentText(origin: Origin | null | undefined): boolean {
  return origin === 'student';
}

/**
 * Tokens for a string, honouring the rule above.
 *
 * A student-origin string is one text token — no parsing, so nothing to lose.
 */
export function tokensFor(text: string, origin: Origin | null | undefined): InlineToken[] {
  return isStudentText(origin) ? [{ kind: 'text', text }] : tokenizeInline(text);
}

/* --------------------------------- Markdown -------------------------------- */

/** Escapes the characters GFM would otherwise read as syntax. */
function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_{}[\]()#+\-!$|~])/g, '\\$1');
}

export function toMarkdown(text: string, origin?: Origin | null): string {
  return markdownFrom(tokensFor(text, origin));
}

export function markdownFrom(tokens: InlineToken[]): string {
  return tokens.map(markdownToken).join('');
}

function markdownToken(token: InlineToken): string {
  switch (token.kind) {
    case 'text':
      return escapeMarkdown(token.text);
    case 'code':
      return `\`${token.text}\``;
    // Re-emitted rather than escaped: `$$\ce{...}$$` is what 06 §2 asks Markdown to carry, and it
    // is what Obsidian's MathJax reads.
    case 'math':
      return token.display ? `$$${token.latex}$$` : `$${token.latex}$`;
    case 'link':
      return `[${escapeMarkdown(token.text)}](${token.href})`;
    case 'bold':
      return `**${markdownFrom(token.children)}**`;
    case 'italic':
      return `*${markdownFrom(token.children)}*`;
  }
}

/* ----------------------------------- HTML ---------------------------------- */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Anki's HTML, with MathJax delimiters.
 *
 * Anki ships MathJax and reads `\(…\)` and `\[…\]`; it does *not* read `$…$`, which is the one
 * detail that decides whether a chemistry deck is readable or is full of dollar signs. mhchem is
 * part of Anki's MathJax build, so `\ce{}` survives as-is.
 */
export function toAnkiHtml(text: string, origin?: Origin | null): string {
  return tokensFor(text, origin).map(htmlToken).join('');
}

function htmlToken(token: InlineToken): string {
  switch (token.kind) {
    case 'text':
      return escapeHtml(token.text);
    case 'code':
      return `<code>${escapeHtml(token.text)}</code>`;
    case 'math':
      // Not escaped: MathJax has to see the backslashes and braces it was given.
      return token.display ? `\\[${token.latex}\\]` : `\\(${token.latex}\\)`;
    case 'link':
      return `<a href="${escapeHtml(token.href)}">${escapeHtml(token.text)}</a>`;
    case 'bold':
      return `<b>${token.children.map(htmlToken).join('')}</b>`;
    case 'italic':
      return `<i>${token.children.map(htmlToken).join('')}</i>`;
  }
}

/* --------------------------------- Plain text ------------------------------- */

/** For alt text, document properties and filenames — syntax dropped, maths kept as its LaTeX. */
export function toPlainText(text: string, origin?: Origin | null): string {
  return tokensFor(text, origin).map(plainToken).join('');
}

function plainToken(token: InlineToken): string {
  switch (token.kind) {
    case 'text':
    case 'code':
      return token.text;
    case 'math':
      return token.latex;
    case 'link':
      return token.text;
    case 'bold':
    case 'italic':
      return token.children.map(plainToken).join('');
  }
}
