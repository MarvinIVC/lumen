'use client';

import type { EnhanceOptions } from '@/lib/ai/schema';

const KEY = 'lumen.default-options';

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
