/**
 * A small RTF reader.
 *
 * RTF is on the accepted list because it is what a Mac's TextEdit and a Windows WordPad save by
 * default, and a student who "saved my notes as a document" often means exactly that. A full RTF
 * parser is a large thing to ship for a rare format, so this handles the subset those two editors
 * emit: control words, groups, destinations to skip, escaped characters, and `\uN` code points.
 *
 * Formatting is dropped rather than translated. Paragraph and line breaks survive, which is all
 * `toBlocks` needs.
 */

/** Groups whose contents are metadata, not text. */
const SKIPPED_DESTINATIONS = new Set([
  'fonttbl',
  'colortbl',
  'stylesheet',
  'info',
  'pict',
  'object',
  'themedata',
  'colorschememapping',
  'latentstyles',
  'datastore',
  'generator',
  'listtable',
  'listoverridetable',
  'rsidtbl',
  'xmlnstbl',
  'mmathPr',
]);

const BREAKS: Record<string, string> = { par: '\n', line: '\n', page: '\n\n', sect: '\n\n' };
const LITERALS: Record<string, string> = {
  tab: '\t',
  emdash: '—',
  endash: '–',
  lquote: '‘',
  rquote: '’',
  ldblquote: '“',
  rdblquote: '”',
  bullet: '•',
  nbsp: ' ',
  '~': ' ',
  '-': '',
  _: '-',
};

export function rtfToText(rtf: string): string {
  let out = '';
  let index = 0;
  /** Depth at which we started skipping, or null. */
  let skipDepth: number | null = null;
  let depth = 0;
  /** `\uN` is followed by a fallback character to discard, `\ucN` says how many. */
  let unicodeSkip = 1;
  const unicodeSkipStack: number[] = [];

  const emit = (text: string) => {
    if (skipDepth === null) out += text;
  };

  while (index < rtf.length) {
    const char = rtf[index];

    if (char === '{') {
      depth += 1;
      unicodeSkipStack.push(unicodeSkip);
      index += 1;
      continue;
    }
    if (char === '}') {
      if (skipDepth !== null && depth === skipDepth) skipDepth = null;
      depth -= 1;
      unicodeSkip = unicodeSkipStack.pop() ?? 1;
      index += 1;
      continue;
    }
    if (char !== '\\') {
      if (char === '\n' || char === '\r') index += 1;
      else {
        emit(char ?? '');
        index += 1;
      }
      continue;
    }

    // A control word, a control symbol, or an escape.
    const rest = rtf.slice(index + 1);
    const word = /^([a-zA-Z]+)(-?\d+)?[ ]?/.exec(rest);
    if (!word) {
      const symbol = rest[0] ?? '';
      if (symbol === "'") {
        const hex = rest.slice(1, 3);
        const code = Number.parseInt(hex, 16);
        // cp1252 is close enough to latin-1 for the range these editors emit.
        if (!Number.isNaN(code)) emit(String.fromCharCode(code));
        index += 4;
        continue;
      }
      if (symbol === '*') {
        // `\*\destination` — an extension group nothing needs to read.
        if (skipDepth === null) skipDepth = depth;
        index += 2;
        continue;
      }
      // `\~`, `\-`, `\_` are control symbols, not control words; the rest escape themselves.
      emit(symbol in LITERALS ? (LITERALS[symbol] ?? '') : symbol);
      index += 2;
      continue;
    }

    const [match, name = '', argument] = word;
    index += 1 + match.length;

    if (name === 'u' && argument !== undefined) {
      const code = Number.parseInt(argument, 10);
      emit(String.fromCharCode(code < 0 ? code + 65536 : code));
      index += unicodeSkip;
      continue;
    }
    if (name === 'uc' && argument !== undefined) {
      unicodeSkip = Math.max(0, Number.parseInt(argument, 10));
      continue;
    }
    if (SKIPPED_DESTINATIONS.has(name)) {
      if (skipDepth === null) skipDepth = depth;
      continue;
    }
    if (name in BREAKS) {
      emit(BREAKS[name] ?? '\n');
      continue;
    }
    if (name in LITERALS) {
      emit(LITERALS[name] ?? '');
      continue;
    }
    // Every other control word is formatting.
  }

  return out;
}

export function looksLikeRtf(text: string): boolean {
  return text.trimStart().startsWith('{\\rtf');
}
