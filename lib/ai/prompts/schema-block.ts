/**
 * The NoteDocument schema, restated for the model (04-AI-ENGINE.md §4.3).
 *
 * It sits inside every DOMAIN_TEMPLATE_BLOCK rather than in RUBRIC_SYSTEM because §4.3 asks for
 * it "near the model" — last stable thing before the volatile run instruction. It is a compressed
 * transcription of `lib/ai/schema.ts`; `tests/unit/prompt-schema.test.ts` asserts the two agree on
 * every block type and every required key, because a drift here is a validation failure the model
 * cannot see the cause of.
 *
 * DeepSeek's json mode is not full JSON-Schema, so this is prose-with-types plus a worked example
 * rather than a `$schema` document — which the spec calls for explicitly (§2).
 */
export const SCHEMA_BLOCK = `## The NoteDocument schema — return exactly this shape

\`\`\`ts
{
  "title": string,                       // the lesson, named as a teacher would name it
  "summary": string,                     // one paragraph, 60-140 words: what this lesson is and why
  "objectives": string[],                // 3-6 "by the end you can…" statements
  "sections": Section[],                 // the body, in the student's order where sensible
  "corrections": Correction[],           // one per factual/mathematical fix you made
  "openQuestions": OpenQuestion[],       // what the notes left ambiguous, and what to confirm
  "factCheck": {
    "calculationsVerified": { "where": string, "ok": boolean, "note": string }[],
    "checkedClaims": number,
    "flags": { "sectionId": string, "claim": string, "issue": string, "confidence": "low"|"medium" }[]
  },
  "studyTools": { "flashcards": Flashcard[], "quiz": QuizItem[] },
  "glossary": { "term": string, "definition": string, "sectionId": string }[],
  "furtherStudy": string[]               // optional: 2-4 "study next" pointers
}

Section = { "id": string, "title": string, "level": 2|3, "blocks": Block[] }
// ids are stable slugs you invent, e.g. "s-1-1-moles". Everything that references a section
// (flashcards, quiz items, corrections, openQuestions, factCheck.flags) must use an id that exists.

// EVERY block carries "origin", and "originalText" when origin is ai-clarified or ai-corrected.
Origin = "student" | "ai-clarified" | "ai-added" | "ai-corrected"

Block =
  | { "type": "paragraph", "text": string }            // markdown-lite; inline math as $…$
  | { "type": "list", "ordered": boolean, "items": string[] }
  | { "type": "definition", "term": string, "definition": string, "aliases"?: string[] }
  | { "type": "formula", "latex": string, "useWhen": string, "number"?: string,
      "where": { "symbol": string, "meaning": string, "units": string }[] }
      // "where" must list EVERY symbol. "units" is required; "dimensionless" is a valid answer,
      // an empty string is not.
  | { "type": "workedExample", "problem": string, "answer": string, "answerLatex"?: string,
      "commonMistake": string,
      "steps": { "text": string, "latex"?: string }[],
      "studentAttempt"?: { "original": string, "issue": string } }
  | { "type": "diagram", "engine": "mermaid", "source": string, "caption": string, "alt": string }
  | { "type": "diagram", "engine": "chart", "spec": ChartSpec, "caption": string, "alt": string }
  | { "type": "structure", "smiles": string, "caption": string, "alt": string }
  | { "type": "callout", "kind": "definition"|"tip"|"warning"|"example", "title"?: string, "text": string }
  | { "type": "misconception", "wrong": string, "right": string }
  | { "type": "table", "caption": string, "columns": { "header": string, "numeric"?: boolean }[],
      "rows": string[][] }
  | { "type": "marginNote", "kind": "connection"|"mnemonic"|"exam-tip"|"why-it-matters",
      "text": string, "anchorId"?: string }

ChartSpec =
  | { "kind": "bars", "x": string, "y": string, "illustrative": boolean, "note"?: string,
      "series": { "label": string, "value": number }[] }
  | { "kind": "line", "x": string, "y": string, "illustrative": boolean,
      "points": { "x": number, "y": number }[],
      "annotations"?: { "x": number, "label": string }[] }
  | { "kind": "steps", "x": string, "y": string, "illustrative": boolean,
      "points": { "x": number, "y": number }[] }
  | { "kind": "composition", "illustrative": boolean,
      "parts": { "label": string, "fraction": number }[] }
// "illustrative" is true whenever the numbers are made up to show a shape rather than measured,
// and the caption must say so in words too.

Correction   = { "sectionId": string, "original": string, "corrected": string, "why": string }
OpenQuestion = { "sectionId": string, "question": string, "why": string }
Flashcard    = { "front": string, "back": string, "hint"?: string, "sectionId": string }
QuizItem     = { "kind": "multiple-choice"|"short-answer", "prompt": string, "choices"?: string[],
                 "answer": string, "explanation": string, "sectionId": string }
\`\`\`

A one-block example, to fix the shape (yours will be richer):

\`\`\`json
{
  "type": "formula",
  "origin": "ai-added",
  "latex": "n = \\\\dfrac{m}{M}",
  "where": [
    { "symbol": "n", "meaning": "amount of substance", "units": "mol" },
    { "symbol": "m", "meaning": "mass of the sample", "units": "g" },
    { "symbol": "M", "meaning": "molar mass", "units": "g mol^-1" }
  ],
  "useWhen": "You have a mass and want moles, or the other way round."
}
\`\`\`

Return json only — one object, no markdown fence around it, no commentary.`;
