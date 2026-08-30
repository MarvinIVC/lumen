/**
 * Pack loader (05-CURRICULUM-PACKS.md §2 "Loader behaviour").
 *
 * Packs are static JSON in the repo, not rows in the database (02-ARCHITECTURE.md §4), so they
 * version with the code and cost nothing to serve.
 *
 * Matching: `curriculum` + `subject`, fuzzy on `displayName`/`course`; then the confirmed unit
 * against `units[].id`/`name` (the review screen lets the user correct a bad match). No match
 * falls back to the generic block (§4).
 *
 * Phase-03 implements the three functions the review screen needs — `listPacks`, `loadPack` and
 * `matchPack` — so the pack-availability badge is real rather than mocked. `buildPackBlock` and
 * `genericBlock` render prompt text and stay declarations until phase-04 builds the prompt.
 */
import type { CurriculumPack, PackUnit } from './types';
import type { Curriculum, NoteContext } from '@/lib/ai/schema';

export type { CurriculumPack, PackTopic, PackUnit } from './types';

export interface PackSummary {
  id: string;
  displayName: string;
  subject: string;
  curriculum: Curriculum;
  status: CurriculumPack['status'];
  unitCount: number;
}

interface Manifest {
  packs: PackSummary[];
}

/**
 * Every pack shipped in `lib/curriculum/packs/`, without parsing the full bodies.
 *
 * The manifest is a separate file rather than a directory scan because the packs have to be
 * enumerable in the browser, where there is no directory to scan. It lives outside `packs/` so
 * `pnpm pack:validate`, which validates every `.json` in there against the pack schema, does not
 * try to validate the index as a pack.
 *
 * It is empty until phase-05 authors the first pack. Everything downstream has to handle that —
 * "no pack for this course" is a supported, unremarkable state (05-CURRICULUM-PACKS.md §4), not a
 * degraded one, and the review screen says so in those words.
 */
export async function listPacks(): Promise<PackSummary[]> {
  const manifest = (await import('./manifest.json')) as unknown as {
    default: Manifest;
  };
  return manifest.default?.packs ?? [];
}

export async function loadPack(packId: string): Promise<CurriculumPack | null> {
  if (!/^[a-z0-9-]+$/.test(packId)) return null;
  try {
    const loaded = await import(`./packs/${packId}.json`);
    return (loaded.default ?? loaded) as CurriculumPack;
  } catch {
    return null;
  }
}

export interface PackMatch {
  pack: CurriculumPack;
  unit: PackUnit | null;
  /** 0–1. Below the loader's threshold the review screen asks the student to confirm. */
  confidence: number;
}

/**
 * Curriculum + subject first, then a fuzzy pass over the course name — a student who typed
 * "AP Chem" should still land on the AP Chemistry pack.
 */
export async function matchPack(context: NoteContext): Promise<PackMatch | null> {
  const packs = await listPacks();
  if (packs.length === 0) return null;

  const course = context.course.toLowerCase();
  const subject = context.subject.toLowerCase();

  const scored = packs
    .map((summary) => {
      let score = 0;
      if (summary.curriculum === context.curriculum) score += 0.5;
      if (summary.subject.toLowerCase() === subject) score += 0.3;
      const name = summary.displayName.toLowerCase();
      if (name === course) score += 0.2;
      else if (course && (name.includes(course) || course.includes(name))) score += 0.12;
      // A draft pack should not be chosen over a stable one on a tie.
      if (summary.status === 'stable') score += 0.02;
      return { summary, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 0.5) return null;

  const pack = await loadPack(best.summary.id);
  if (!pack) return null;

  const unit = context.unit ? matchUnit(pack, context.unit) : null;
  return { pack, unit, confidence: Math.min(1, best.score) };
}

function matchUnit(pack: CurriculumPack, unit: string): PackUnit | null {
  const wanted = unit.toLowerCase();
  const number = /\b(\d+)\b/.exec(wanted)?.[1];
  return (
    pack.units.find((entry) => entry.name.toLowerCase() === wanted) ??
    pack.units.find((entry) => wanted.includes(entry.name.toLowerCase())) ??
    (number
      ? (pack.units.find((entry) => new RegExp(`\\b${number}\\b`).test(entry.id)) ??
        pack.units.find((entry) => new RegExp(`\\b${number}\\b`).test(entry.name)) ??
        null)
      : null)
  );
}

/**
 * The rendered CURRICULUM_PACK_BLOCK: global conventions plus every topic of the matched unit
 * (a "lesson" often spans two or three). Must stay under ~1200 tokens so it caches cheaply.
 */
export interface CurriculumPackBlock {
  packId: string | null;
  unitId: string | null;
  text: string;
  approxTokens: number;
}

export declare function buildPackBlock(match: PackMatch | null): CurriculumPackBlock;

/** §4 — used when there is no pack: infer scope from the notes, do not over-reach. */
export declare function genericBlock(context: NoteContext): CurriculumPackBlock;

/** Validates a pack against `pack.schema.json`. Shared by the loader and `pnpm pack:validate`. */
export declare function validatePack(input: unknown): { ok: boolean; errors: string[] };
