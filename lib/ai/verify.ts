/**
 * Stage C — applying the examiner's patches (04-AI-ENGINE.md §6).
 *
 * The verify pass returns patches, not prose, and this applies them deterministically. The rule
 * that shapes everything here: **a patch that cannot be applied exactly is not applied at all**.
 * A fuzzy match would let a second model quietly rewrite a sentence it only half recognised, which
 * is the one failure mode a verification step must not have. An unfindable target becomes a
 * fact-check flag instead — visible to the student, harmless to the text.
 *
 * The second rule is about provenance: fixing something the student wrote produces a `Correction`
 * and an `ai-corrected` mark, because that is a thing they need to relearn. Fixing something the
 * model itself added produces neither — it is our error, not theirs, and putting it in their
 * corrections panel would be both confusing and slightly dishonest.
 */
import { computeStats } from './validate';
import type { Block, Correction, FactCheckFlag, NoteDocument, Section } from './schema';

export interface VerifyPatch {
  sectionId: string;
  kind: 'fix' | 'add-open-question' | 'soften';
  /** An exact quote of the draft text to change. */
  target: string;
  replacement: string;
  reason: string;
}

export interface VerifyResult {
  patches: VerifyPatch[];
  calculations: { where: string; ok: boolean; note: string }[];
  flags: { sectionId: string; claim: string; issue: string; confidence: 'low' | 'medium' }[];
  verdict: 'ok' | 'minor-fixes' | 'significant-fixes';
}

export interface AppliedVerify {
  document: NoteDocument;
  applied: number;
  /** Patches we refused to guess at, with why — surfaced in the logs, not to the student. */
  skipped: { patch: VerifyPatch; reason: string }[];
}

/** §6: complete/study_guide, on the families `app_config.verify_families` names. */
export function shouldVerify(
  mode: string,
  domainFamily: string | undefined,
  verifyFamilies: string[],
): boolean {
  if (mode !== 'complete' && mode !== 'study_guide') return false;
  return verifyFamilies.includes(domainFamily ?? 'generic');
}

const KINDS = new Set(['fix', 'add-open-question', 'soften']);

export function parseVerifyResult(raw: unknown): VerifyResult | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Record<string, unknown>;

  const patches = (Array.isArray(value.patches) ? value.patches : [])
    .filter(
      (patch): patch is Record<string, unknown> => typeof patch === 'object' && patch !== null,
    )
    .filter((patch) => typeof patch.sectionId === 'string' && KINDS.has(String(patch.kind)))
    .map((patch) => ({
      sectionId: String(patch.sectionId),
      kind: String(patch.kind) as VerifyPatch['kind'],
      target: typeof patch.target === 'string' ? patch.target : '',
      replacement: typeof patch.replacement === 'string' ? patch.replacement : '',
      reason: typeof patch.reason === 'string' ? patch.reason : '',
    }));

  const calculations = (Array.isArray(value.calculations) ? value.calculations : [])
    .filter(
      (entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null,
    )
    .map((entry) => ({
      where: String(entry.where ?? ''),
      ok: entry.ok !== false,
      note: String(entry.note ?? ''),
    }));

  const flags = (Array.isArray(value.flags) ? value.flags : [])
    .filter(
      (entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null,
    )
    .map((entry) => ({
      sectionId: String(entry.sectionId ?? ''),
      claim: String(entry.claim ?? ''),
      issue: String(entry.issue ?? ''),
      confidence: entry.confidence === 'medium' ? ('medium' as const) : ('low' as const),
    }));

  const verdict =
    value.verdict === 'significant-fixes' || value.verdict === 'minor-fixes'
      ? value.verdict
      : ('ok' as const);

  return { patches, calculations, flags, verdict };
}

/** Rewrites every string a block renders, leaving its structure alone. */
function mapBlockText(block: Block, map: (text: string) => string): Block {
  switch (block.type) {
    case 'paragraph':
      return { ...block, text: map(block.text) };
    case 'list':
      return { ...block, items: block.items.map(map) };
    case 'definition':
      return { ...block, term: map(block.term), definition: map(block.definition) };
    case 'formula':
      return {
        ...block,
        latex: map(block.latex),
        useWhen: map(block.useWhen),
        where: block.where.map((variable) => ({
          ...variable,
          meaning: map(variable.meaning),
          units: map(variable.units),
        })),
      };
    case 'workedExample':
      return {
        ...block,
        problem: map(block.problem),
        answer: map(block.answer),
        ...(block.answerLatex ? { answerLatex: map(block.answerLatex) } : {}),
        commonMistake: map(block.commonMistake),
        steps: block.steps.map((step) => ({
          ...step,
          text: map(step.text),
          ...(step.latex ? { latex: map(step.latex) } : {}),
        })),
      };
    case 'callout':
      return {
        ...block,
        text: map(block.text),
        ...(block.title ? { title: map(block.title) } : {}),
      };
    case 'misconception':
      return { ...block, wrong: map(block.wrong), right: map(block.right) };
    case 'table':
      return { ...block, rows: block.rows.map((row) => row.map(map)) };
    case 'marginNote':
      return { ...block, text: map(block.text) };
    // A diagram's source and a structure's SMILES are code, not prose: a string replace inside
    // them would produce something that no longer parses. Captions are left alone with them, so a
    // patch aimed at a figure is skipped rather than half-applied.
    default:
      return block;
  }
}

function blockContains(block: Block, target: string): boolean {
  let found = false;
  mapBlockText(block, (text) => {
    if (!found && text.includes(target)) found = true;
    return text;
  });
  return found;
}

export function applyPatches(document: NoteDocument, result: VerifyResult): AppliedVerify {
  const skipped: { patch: VerifyPatch; reason: string }[] = [];
  let applied = 0;

  const sections: Section[] = document.sections.map((section) => ({
    ...section,
    blocks: [...section.blocks],
  }));
  const byId = new Map(sections.map((section) => [section.id, section]));
  const corrections: Correction[] = [...document.corrections];
  const openQuestions = [...document.openQuestions];
  const flags: FactCheckFlag[] = [...document.factCheck.flags];

  for (const patch of result.patches) {
    const section = byId.get(patch.sectionId);
    if (!section) {
      skipped.push({ patch, reason: 'unknown section' });
      continue;
    }

    if (patch.kind === 'add-open-question') {
      const question = patch.replacement || patch.reason;
      if (!question) {
        skipped.push({ patch, reason: 'no question text' });
        continue;
      }
      openQuestions.push({ sectionId: section.id, question, why: patch.reason });
      applied += 1;
      continue;
    }

    if (patch.kind === 'soften') {
      if (!patch.target) {
        skipped.push({ patch, reason: 'no claim to soften' });
        continue;
      }
      flags.push({
        sectionId: section.id,
        claim: patch.target,
        issue: patch.reason || 'A second check was not confident about this claim.',
        confidence: 'medium',
      });
      applied += 1;
      continue;
    }

    // kind === 'fix'
    if (!patch.target || !patch.replacement) {
      skipped.push({ patch, reason: 'fix had no target or no replacement' });
      continue;
    }
    const index = section.blocks.findIndex((block) => blockContains(block, patch.target));
    if (index < 0) {
      // The examiner quoted something that is not in the draft. Never guess — flag it instead.
      flags.push({
        sectionId: section.id,
        claim: patch.target,
        issue:
          patch.reason || 'A second check disagreed with this, but we could not locate it exactly.',
        confidence: 'medium',
      });
      skipped.push({ patch, reason: 'target not found in the section' });
      continue;
    }

    const original = section.blocks[index];
    if (!original) continue;
    let replacedOnce = false;
    const patched = mapBlockText(original, (text) => {
      if (replacedOnce || !text.includes(patch.target)) return text;
      replacedOnce = true;
      return text.replace(patch.target, patch.replacement);
    });

    const wasStudents = original.origin === 'student';
    section.blocks[index] = wasStudents
      ? { ...patched, origin: 'ai-corrected', originalText: original.originalText ?? patch.target }
      : patched;

    if (wasStudents) {
      corrections.push({
        sectionId: section.id,
        original: patch.target,
        corrected: patch.replacement,
        why: patch.reason,
      });
    }
    applied += 1;
  }

  for (const flag of result.flags) {
    if (!byId.has(flag.sectionId)) continue;
    flags.push(flag);
  }

  const verified = [...document.factCheck.calculationsVerified, ...result.calculations];
  const document2: NoteDocument = {
    ...document,
    sections,
    corrections,
    openQuestions,
    factCheck: {
      ...document.factCheck,
      calculationsVerified: verified,
      flags,
      checkedClaims: document.factCheck.checkedClaims + result.patches.length + result.flags.length,
      verdict: result.verdict,
    },
  };
  document2.stats = computeStats(document2);

  return { document: document2, applied, skipped };
}
