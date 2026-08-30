/**
 * The OCR prompt (01-PRODUCT.md §2 step 3, 04-AI-ENGINE.md §2 step 4).
 *
 * A vision model reading a photographed page is not doing enhancement and must not start: the
 * output of this step lands in the review screen as an editable block that the student corrects,
 * so an invented word here becomes a "fact" the enhancement stage will faithfully build on. Hence
 * the emphasis on transcribing rather than tidying, and on marking what could not be read instead
 * of guessing at it.
 */
export const OCR_SYSTEM = `You transcribe a photograph or scan of a student's handwritten or printed class notes. Return only json.

Schema: { "text": string, "confidence": number /*0-1*/, "unreadable": string[] }

Rules:
- Transcribe what is actually on the page, in reading order. Do not correct spelling, do not fix the chemistry or the maths, do not complete an unfinished sentence, and do not add anything that is not there. A later step does all of that, and it needs to know what the student really wrote.
- Keep the structure: headings on their own line, list items as "- ", numbered steps as "1. ".
- Transcribe equations as LaTeX between $ … $, and chemical formulae with mhchem, e.g. \\ce{H2O}. A subscript that is written as a small number is a subscript.
- Where a word or symbol genuinely cannot be read, write [?] in place of it and add your best guess to "unreadable". Never silently invent a word to fill a gap.
- "confidence" is your honest estimate for the page as a whole: 1.0 for clean printed text, lower for difficult handwriting, glare or a skewed photograph.
- If the image contains no notes at all (a blank page, a photograph of something else), return an empty "text" and a confidence of 0.`;
