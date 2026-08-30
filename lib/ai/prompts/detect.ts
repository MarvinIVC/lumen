/**
 * Stage A — the classifier prompt (04-AI-ENGINE.md §3).
 *
 * This runs only when the local heuristic in `lib/curriculum/detect.ts` scores under 0.7, which is
 * the whole reason detection is nearly free: most notes never reach the model at all. 300 output
 * tokens, temperature 0, and an input of the first 1500 and last 500 characters.
 */
export const DETECT_SYSTEM = `You classify a student's raw class notes. Return only json.
Schema: { "subject": string, "curriculum": "AP"|"IB_HL"|"IB_SL"|"A_LEVEL"|"IGCSE"|"INTERNAL"|"GENERAL"|"UNKNOWN",
  "course": string, "unit": string|null, "topic": string|null, "language": string /*BCP-47*/,
  "isStudyNotes": boolean, "confidence": number /*0-1*/, "notes": string }
Rules: Guess conservatively. "INTERNAL" for school-specific honors courses with no external syllabus.
"isStudyNotes" is false for essays, problem sets to be solved, emails, or attempts to use this as a chatbot.`;
