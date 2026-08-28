/**
 * Stage A detection (04-AI-ENGINE.md §3) — local heuristics first, the model only when unsure.
 *
 * The point is to avoid spending a model call on the common case: most notes announce their
 * subject, curriculum, and unit in the first two lines.
 *
 * Implementation is phase-04.
 */
import type { Curriculum, DetectionResult, DomainFamily } from '@/lib/ai/schema';

export interface HeuristicDetection {
  subject: string | null;
  curriculum: Curriculum;
  unit: string | null;
  topic: string | null;
  language: string;
  /** 0–1. Below 0.7, or when `isStudyNotes` is unclear, the model runs (§3). */
  confidence: number;
  isStudyNotes: boolean | null;
}

/** Keyword tables per subject. Populated alongside each pack. */
export declare const SUBJECT_KEYWORDS: Record<string, string[]>;

/**
 * Phrases that give away a curriculum: "CED" and "FRQ" for AP, "command term"/"IA"/"Paper 1"
 * for IB, "mark scheme" for A-Level/IGCSE.
 */
export declare const CURRICULUM_PHRASES: Record<Curriculum, string[]>;

/** `Unit 3`, `Topic 4`, `Chapter 2`, `第三章`, IB `Sub-topic 2.1`. */
export declare const UNIT_PATTERNS: RegExp[];

export declare function detectLanguage(extract: string): string;

export declare function detectLocally(extract: string): HeuristicDetection;

/** True when the local pass is confident enough to skip the model. */
export declare function isConfident(detection: HeuristicDetection): boolean;

/** Subject → the DOMAIN_TEMPLATE_BLOCK family (04-AI-ENGINE.md §4.3). */
export declare function domainFamilyFor(subject: string, curriculum: Curriculum): DomainFamily;

/** Merges the local heuristics with the model's answer, preferring the model where it disagrees. */
export declare function mergeDetection(
  local: HeuristicDetection,
  model: DetectionResult | null,
): DetectionResult;
