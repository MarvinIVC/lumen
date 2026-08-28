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
 * Implementation is phase-04.
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

/** Every pack shipped in `lib/curriculum/packs/`, without parsing the full bodies. */
export declare function listPacks(): Promise<PackSummary[]>;

export declare function loadPack(packId: string): Promise<CurriculumPack | null>;

export interface PackMatch {
  pack: CurriculumPack;
  unit: PackUnit | null;
  /** 0–1. Below the loader's threshold the review screen asks the student to confirm. */
  confidence: number;
}

export declare function matchPack(context: NoteContext): Promise<PackMatch | null>;

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
