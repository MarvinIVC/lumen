'use client';

import type { EnhanceOptions } from '@/lib/ai/schema';
import type { ExportOptions } from '@/lib/export/types';

const KEY = 'lumen.default-options';
const EXPORT_KEY = 'lumen.export-options';

export function readDefaultOptions(fallback: EnhanceOptions): EnhanceOptions {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '') as Partial<EnhanceOptions>;
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

export function writeDefaultOptions(options: EnhanceOptions): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(options));
  } catch {
    // The current session still holds the choice when storage is unavailable.
  }
}

/**
 * The two export toggles, remembered between exports.
 *
 * A student who turns the provenance marks off for a copy they are handing in wants them off next
 * time too, and re-deciding on every export is the kind of small friction that makes a feature
 * feel unfinished.
 */
export function readExportOptions(fallback: ExportOptions): ExportOptions {
  try {
    const parsed = JSON.parse(localStorage.getItem(EXPORT_KEY) ?? '') as Partial<ExportOptions>;
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

export function writeExportOptions(options: ExportOptions): void {
  try {
    localStorage.setItem(EXPORT_KEY, JSON.stringify(options));
  } catch {
    // The current session still holds the choice when storage is unavailable.
  }
}
