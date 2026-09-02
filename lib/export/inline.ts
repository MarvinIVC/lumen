/**
 * Inline text, out of the tokenizer and into each format (06 §2).
 *
 * **Every origin is parsed, exactly as the renderer parses it.** This is phase-05's open question,
 * and the answer turned out not to be the one it assumed. The worry was that `renderInline` treats
 * a student's `*` as emphasis, so `the * marks the limiting reagent` would lose its asterisk — and
 * in an exported file that damage is permanent, because Obsidian re-applies the same rule on every
 * open. Emitting student-origin text verbatim looked like the safe fix.
 *
 * It is not, because `origin: 'student'` does not mean "these are the student's characters". It
 * means the substance is the student's. In the AP Chem fixture the student typed `Remember: Have
 * No Fear of Ice Cold Beer`; the model returned `**"Have No Fear Of Ice Cold Beer"** → **H**ydrogen
 * ...` with `$\ce{O2}$` in it, still marked `student`, because the mnemonic is theirs. Escaping
 * that put `\*\*` and `\$\\ce\{O2\}\$` in front of the student in every format: a real,
 * visible regression on every note, traded against a hypothetical one this corpus does not contain.
 *
 * No field in the document holds raw keystrokes — `Correction.original` and `originalText` are the
 * model's transcription of what the student wrote, and carry its notation too. So there is nothing
 * to protect, and the exporters match the renderer instead. Recorded in the phase log.
 */
import { tokenizeInline } from '@/lib/render/markdown/tokens';
import type { InlineToken } from '@/lib/render/markdown/tokens';

export { tokenizeInline as tokensFor };

/* --------------------------------- Markdown -------------------------------- */

/**
 * Escapes the characters GFM would otherwise read as syntax — and only those.
 *
 * The obvious set is every punctuation mark the CommonMark spec lists as escapable, and it is
 * actively wrong here. `\(units u\)` is not merely noisy: `\(` and `\)` are MathJax's inline
 * delimiters, so Obsidian renders an escaped parenthesis as the *start of an equation*. Escaping
 * `-` and `+` mid-sentence produces `particle\-level` for no benefit at all.
 *
 * So this escapes what can actually change the meaning of a run of text: the emphasis and code
 * marks, the link brackets, the maths delimiter, the table separator, and the backslash itself.
 * A lone `~` is not strikethrough — GFM needs two — and `\~0.1 g` is a common thing to write. `#`, `-`, `+` and `>` are only syntax at the start of a line, and every emitter
 * here writes text after a marker rather than at column zero.
 */
function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_[\]$|<])/g, '\\$1');
}

export function toMarkdown(text: string): string {
  return markdownFrom(tokenizeInline(text));
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
export function toAnkiHtml(text: string): string {
  return tokenizeInline(text).map(htmlToken).join('');
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
export function toPlainText(text: string): string {
  return tokenizeInline(text).map(plainToken).join('');
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
