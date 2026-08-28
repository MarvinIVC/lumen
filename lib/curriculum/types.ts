/**
 * Types mirroring `pack.schema.json` (05-CURRICULUM-PACKS.md §2).
 * The JSON Schema is the contract for community authors; this is the same shape for the app.
 */
import type { Curriculum, DomainFamily } from '@/lib/ai/schema';

export type PackStatus = 'stable' | 'beta' | 'draft';

export interface PackTopic {
  id: string;
  name: string;
  objectiveCodes?: string[];
  /** What a student must be able to DO. */
  scope: string;
  mustDefine: string[];
  requiredDepth: string;
  commonMisconceptions?: string[];
  workedExamplePatterns?: string[];
  visualsThatHelp?: string[];
  connections?: string[];
}

export interface PackUnit {
  id: string;
  name: string;
  bigIdeas?: string[];
  summary: string;
  topics: PackTopic[];
}

export interface PackGlobalConventions {
  notation: string[];
  commandTerms?: Record<string, string>;
  providedReference?: string[];
  mustMemorise?: string[];
  /** Shortcuts the course actually penalises, e.g. "atomic mass = molar mass" unqualified. */
  penalisedShortcuts?: string[];
}

export interface CurriculumPack {
  id: string;
  version: string;
  subject: string;
  curriculum: Exclude<Curriculum, 'UNKNOWN'>;
  displayName: string;
  language: string;
  domainFamily: DomainFamily;
  authority: string;
  disclaimer?: string;
  status: PackStatus;
  maintainers?: string[];
  globalConventions: PackGlobalConventions;
  equationsSheet?: string[];
  units: PackUnit[];
}
