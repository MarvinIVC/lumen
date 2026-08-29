import type { Origin } from '@/lib/ai/schema';

export type AiOrigin = Exclude<Origin, 'student'>;

/**
 * The provenance vocabulary, split out of `provenance-mark.tsx` so it is not trapped behind a
 * `'use client'` boundary.
 *
 * The marketing hero shows a corrected block as static server-rendered HTML — it must look exactly
 * like the real thing, but the landing page has a JS budget measured in single-digit kilobytes and
 * cannot afford to hydrate a renderer to draw one tinted box. Sharing the class maps is what keeps
 * the two identical: change a tint here and the hero changes with the app.
 */
export const PROVENANCE_LABELS: Record<AiOrigin, string> = {
  'ai-added': 'added',
  'ai-clarified': 'clarified',
  'ai-corrected': 'corrected',
};

export const PROVENANCE_SURFACES: Record<AiOrigin, { calm: string; loud: string }> = {
  'ai-added': {
    calm: 'border-l-2 border-ai-added-rule bg-ai-added/50',
    loud: 'border-l-2 border-ai-added-rule bg-ai-added',
  },
  'ai-clarified': {
    calm: 'border-l-2 border-link/40 bg-ai-clarified/60',
    loud: 'border-l-2 border-link bg-ai-clarified',
  },
  'ai-corrected': {
    calm: 'border-l-2 border-ai-corrected-mark/70 bg-ai-corrected/70',
    loud: 'border-l-2 border-ai-corrected-mark bg-ai-corrected',
  },
};

/** The block shell every provenance treatment shares. */
export const PROVENANCE_BLOCK = 'group/prov relative rounded-r-note py-1 pr-3 pl-4';
