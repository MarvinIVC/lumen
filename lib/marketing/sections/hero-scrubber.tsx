'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * The hero's before/after control — one of only two client components on the landing page.
 *
 * It owns almost nothing. The sweep, the seam, the clipping and the reduced-motion fallback are all
 * in `marketing.css`; the two documents are server components handed in as props, so none of their
 * markup or data ships as JavaScript. What is left here is the smallest thing that cannot be CSS:
 * mirroring a slider's value into `--wipe`, and telling the container to stop animating once a
 * person has taken hold of it.
 */
export function HeroScrubber({
  before,
  after,
  beforeLabel,
  afterLabel,
  label,
  valueTemplate,
}: {
  before: ReactNode;
  after: ReactNode;
  beforeLabel: ReactNode;
  afterLabel: ReactNode;
  label: string;
  /**
   * The spoken value, as a template with `{percent}` and `{rest}` in it — a bare number tells a
   * screen-reader user nothing useful, and a function cannot cross a server/client boundary.
   */
  valueTemplate: string;
}) {
  const [value, setValue] = useState(62);
  const [engaged, setEngaged] = useState(false);

  /*
   * The slider is added after mount rather than rendered on the server. Without JavaScript the
   * autoplay still sweeps, and a control that covers the whole comparison but cannot move it would
   * be worse than no control at all — it would swallow text selection and offer a focus stop that
   * leads nowhere.
   */
  const [interactive, setInteractive] = useState(false);
  useEffect(() => setInteractive(true), []);

  return (
    <div
      className="lumen-wipe overflow-hidden rounded-note"
      data-paused={engaged ? 'true' : undefined}
      data-interactive={interactive ? 'true' : undefined}
      // Untouched, --wipe belongs to the keyframes. Writing an inline value before the reader has
      // engaged would freeze the autoplay on first paint.
      style={engaged ? ({ '--wipe': `${value}%` } as CSSProperties) : undefined}
    >
      <div className="lumen-wipe__before">{before}</div>
      <div className="lumen-wipe__after">{after}</div>

      {/*
        Pinned to the container's corners rather than inside the panels, which are clipped. Below
        640px the panels stack, both corners sit above the *first* one, and the inline copies inside
        each panel take over — hence the paired `max-sm:hidden` / `sm:hidden`. The switch is two
        Tailwind utilities rather than a rule in marketing.css because that file is `@layer
        components`, which loses to the `inline-flex` utility on the chip itself.
      */}
      <div className="lumen-wipe__labels max-sm:hidden">
        {beforeLabel}
        {afterLabel}
      </div>

      <div className="lumen-wipe__seam" aria-hidden="true">
        <span className="lumen-wipe__grip">
          <span aria-hidden="true">↔</span>
        </span>
      </div>

      {interactive ? (
        <input
          type="range"
          className="lumen-wipe__handle"
          min={0}
          max={100}
          step={1}
          value={value}
          aria-label={label}
          aria-valuetext={valueTemplate
            .replace('{percent}', String(100 - value))
            .replace('{rest}', String(value))}
          onChange={(event) => {
            setValue(event.currentTarget.valueAsNumber);
            setEngaged(true);
          }}
        />
      ) : null}
    </div>
  );
}
