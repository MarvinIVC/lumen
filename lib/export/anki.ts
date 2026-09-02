/**
 * `ExportModel` → an Anki-importable text file (06 §2).
 *
 * **CSV rather than `.apkg` for v1**, as 06 §2 allows. The decision is not about difficulty: a
 * `Flashcard` is `{front, back, hint, sectionId}` — text and maths, never an image — so a deck
 * built from it has no media, and media is the only thing the file format buys that a text import
 * does not. Against that, `collection.anki2` is a SQLite schema with a checksum over the stripped
 * first field, an `\x1f` field separator and per-note GUIDs, every one of which fails silently:
 * Anki either refuses the file or imports notes whose cards never appear. `.apkg` is tracked for
 * v1.1, where it is worth doing properly with sql.js.
 *
 * What makes this import cleanly is the header block. Anki reads `#` directives at the top of the
 * file and configures its own import dialog from them, so the student picks the file and presses
 * Import — no separator guessing, no field mapping, no "which column is the tag".
 */
import { toAnkiHtml, toPlainText } from './inline';
import type { ExportModel } from './types';

/**
 * Tab, not comma.
 *
 * A chemistry card is full of commas — `\ce{Ca^2+}, aqueous` — and every one of them would need
 * the field quoting, which is the part of CSV that implementations disagree about. A tab appears
 * in none of this text, and Anki names it as a separator directly.
 */
const SEP = '\t';

/**
 * Anki tags cannot contain spaces, and `::` is its hierarchy separator.
 *
 * The dot and the dash are kept, because they are the unit numbering: stripping them turns
 * "Unit 1 (Topics 1.1–1.4)" into `Unit_1_Topics_1114`, which is not a thing anyone can search for.
 * The en dash is folded to a hyphen for the same reason.
 */
function tag(value: string): string {
  return value
    .trim()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/::/g, '_')
    .replace(/[^\p{L}\p{N}_\-.]/gu, '');
}

function deckName(model: ExportModel): string {
  return ['Lumen', model.context.course, model.context.unit]
    .filter((part): part is string => Boolean(part && part.trim()))
    .map((part) => part.replace(/::/g, '—').trim())
    .join('::');
}

function tagsFor(model: ExportModel): string {
  return ['lumen', model.context.course, model.context.unit]
    .filter((part): part is string => Boolean(part && part.trim()))
    .map(tag)
    .filter(Boolean)
    .join(' ');
}

/**
 * A field, flattened onto one line.
 *
 * A newline inside a field ends the row, whatever the separator is. With `#html:true` set, `<br>`
 * is the same thing to a reader and is safe to a parser.
 */
function field(html: string): string {
  return html.replace(/\r?\n/g, '<br>').replace(/\t/g, ' ');
}

export function toAnkiCsv(model: ExportModel): string {
  const tags = tagsFor(model);
  const lines = [
    `#separator:${SEP === '\t' ? 'tab' : 'comma'}`,
    '#html:true',
    '#notetype:Basic',
    `#deck:${deckName(model)}`,
    '#columns:Front' + SEP + 'Back' + SEP + 'Tags',
    '#tags column:3',
  ];

  for (const card of model.flashcards) {
    // The hint belongs on the front — it is what you read *before* trying to recall, and Anki's
    // Basic note type has nowhere else to put it.
    const hint = card.hint
      ? `<br><span style="font-size:0.85em;opacity:0.7">${toAnkiHtml(card.hint)}</span>`
      : '';
    const front = field(`${toAnkiHtml(card.front)}${hint}`);
    const back = field(toAnkiHtml(card.back));
    lines.push([front, back, tags].join(SEP));
  }

  return `${lines.join('\n')}\n`;
}

/** The one-screen import guide that ships beside the file (06 §2). */
export function ankiGuide(model: ExportModel): string {
  const deck = deckName(model);
  return `# Importing these cards into Anki

You have **${model.flashcards.length} card${model.flashcards.length === 1 ? '' : 's'}** from
*${toPlainText(model.title)}*.

1. Open Anki on your computer. (The mobile apps cannot import files; import here and sync.)
2. **File → Import…**, and choose \`flashcards.txt\`.
3. Anki reads the settings from the top of the file, so the dialog should already say
   **Basic**, deck **${deck}**, and three fields. Press **Import**.
4. The cards land in **${deck}**, tagged so you can find them later.

## If the maths looks like backslashes

The cards use MathJax, which Anki has built in — \`\\(x\\)\` for inline and \`\\[x\\]\` for
display. It renders when you review the card, not in the browse list. Chemistry uses \`\\ce{}\`,
which Anki's MathJax also understands.

## If you would rather have a different note type

Import as above, then select the cards in the browser and use **Notes → Change Note Type**. The
first field is the front and the second is the back.
`;
}
