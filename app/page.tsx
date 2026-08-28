import { AI_DISCLAIMER, APP_NAME, APP_TAGLINE } from '@/lib/config';
import { SCHEMA_VERSION } from '@/lib/ai/versions';

import { ThemeSwitcher } from './theme-switcher';

/**
 * Placeholder home. The real marketing site is phase-02 (03-DESIGN.md §8); this page exists to
 * prove the deploy pipeline, the fonts, and the theme controller end to end.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[46rem] flex-col justify-center px-6 py-16">
      <p className="font-mono text-xs tracking-widest text-text-muted uppercase">
        Phase 00 · scaffold · schema v{SCHEMA_VERSION}
      </p>

      <h1 className="mt-6 font-serif text-3xl leading-tight font-semibold text-text sm:text-4xl">
        {APP_NAME}
      </h1>

      <p className="mt-5 max-w-[34rem] font-serif text-md leading-note text-text-muted">
        {APP_TAGLINE}
      </p>

      <hr className="my-10 border-0 border-t border-border" />

      <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-[9rem_1fr]">
        <dt className="text-text-muted">Appearance</dt>
        <dd>
          <ThemeSwitcher />
          <p className="mt-2 text-xs text-text-muted">
            System follows your device. A choice here persists across reloads.
          </p>
        </dd>

        <dt className="text-text-muted">Type</dt>
        <dd className="text-text-muted">
          <span className="font-serif">Newsreader</span> for notes ·{' '}
          <span className="font-sans">Inter</span> for chrome ·{' '}
          <span className="font-mono">JetBrains Mono</span> for code
        </dd>

        <dt className="text-text-muted">Palette</dt>
        <dd className="flex flex-wrap items-center gap-2">
          {(
            [
              ['bg-bg-sunken', 'sunken'],
              ['bg-accent', 'accent'],
              ['bg-accent-weak', 'accent weak'],
              ['bg-ai-corrected', 'corrected'],
              ['bg-success', 'success'],
              ['bg-warning', 'warning'],
              ['bg-danger', 'danger'],
            ] as const
          ).map(([swatch, label]) => (
            <span
              key={label}
              title={label}
              className={`size-6 rounded-sm border border-border ${swatch}`}
            />
          ))}
        </dd>
      </dl>

      <p className="mt-12 text-xs text-text-muted">{AI_DISCLAIMER}</p>
    </main>
  );
}
