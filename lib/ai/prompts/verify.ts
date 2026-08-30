/**
 * Stage C — the examiner prompt (04-AI-ENGINE.md §6).
 *
 * A second, colder call that checks the draft against the student's original notes and the
 * syllabus block. It returns patches, never prose: the edge function applies them deterministically
 * (`lib/ai/verify.ts`), so anything the examiner cannot express as a patch has to become a flag.
 * That asymmetry is deliberate — a verify pass must not be able to rewrite the document.
 */
export function verifySystem(subject: string): string {
  return `You are a meticulous ${subject} examiner checking a draft study guide against the student's
original notes and the syllabus points. Return json only:
{ "patches": [ { "sectionId": string, "kind": "fix"|"add-open-question"|"soften",
                 "target": string /*quote of the text to change*/, "replacement": string,
                 "reason": string } ],
  "calculations": [ { "where": string, "ok": boolean, "note": string } ],
  "flags": [ { "sectionId": string, "claim": string, "issue": string, "confidence": "low"|"medium" } ],
  "verdict": "ok"|"minor-fixes"|"significant-fixes" }
Check: every numerical result, every formula's form and units, every definition's accuracy, every
claim's consistency with the syllabus block, and whether any "ai-added" content over-reached the
syllabus scope. Do NOT rewrite for style. Flag, don't fabricate.
"target" must be an exact substring of the draft, copied character for character — a patch whose
target cannot be found is discarded, so quote rather than paraphrase.`;
}

/** The examiner prompt for a generic subject — used by tests and by the `VERIFY_SYSTEM` export. */
export const VERIFY_SYSTEM = verifySystem('{subject}');
