import { PROVENANCE_BLOCK, PROVENANCE_SURFACES } from '@/lib/render/provenance-styles';

import { PanelLabel } from './raw-page';

/**
 * The right-hand panel: the same passage after {@link https://github.com/MarvinIVC/lumen the
 * pipeline}, typeset. The text is taken from `fixtures/ap-chem-u1-gold.md`, and
 * `tests/unit/marketing-excerpts.test.ts` asserts every sentence here still appears in that file.
 *
 * Two deliberate departures from simply rendering `NoteDocument` here:
 *
 * 1. **It is hand-set, not parsed.** The hero shows one passage, cropped and composed to sit
 *    beside the messy page at the same height. The full renderer arrives further down the page in
 *    the "See it on a real lesson" section, where it belongs and where it can be lazily loaded.
 * 2. **The one equation is CSS, not KaTeX.** Loading KaTeX's stylesheet and its font files on the
 *    critical path to draw a single fraction would cost the hero its LCP target
 *    (02-ARCHITECTURE.md §8) for no legibility gained. `n = m/M` is a stacked fraction and a rule.
 *
 * The provenance treatment is *not* re-drawn: it imports the same class maps the app's
 * `ProvenanceBlock` uses, so a change to the corrected tint reaches the landing page too.
 */
export function GoldPage({
  caption,
  label,
  correctedLabel,
}: {
  caption: string;
  label: string;
  correctedLabel: string;
}) {
  return (
    <div className="flex h-full flex-col bg-bg p-4 sm:p-8">
      <PanelLabel tone="accent" className="mb-3 sm:hidden">
        {label}
      </PanelLabel>

      <div className="lumen-note grow rounded-note border border-border bg-bg-raised px-5 py-6 shadow-card sm:px-8">
        <p className="font-sans text-xs tracking-wide text-text-muted">
          AP Chemistry · Unit 1 (Topics 1.1–1.4)
        </p>
        {/* h2 then h3, not h3 then h4: this panel sits directly under the page's h1, and a jumped
            level is a real navigation failure for anyone moving by heading, not a technicality. */}
        <h2 className="mt-2 font-serif text-lg leading-tight font-semibold text-balance text-text sm:text-xl">
          {caption}
        </h2>

        <h3 className="mt-6 font-serif text-md font-semibold text-text">
          1.1 — The mole and molar mass
        </h3>

        <p className="mt-3">
          A <strong className="font-semibold">mole</strong> is a <em>count</em>, like “a dozen” —
          just very large. One mole = <Sci mantissa="6.022" exponent="23" /> items (the{' '}
          <strong className="font-semibold">Avogadro constant</strong>, <Var>N</Var>
          <sub>A</sub>). We use it because a countable number of atoms weighs a convenient number of
          grams.
        </p>

        <div
          className={`${PROVENANCE_BLOCK} ${PROVENANCE_SURFACES['ai-corrected'].loud} mt-5`}
          data-origin="ai-corrected"
        >
          <span className="absolute top-1 right-2 font-sans text-xs tracking-wide text-text-muted">
            {correctedLabel}
          </span>
          {/* Room for the absolutely-positioned label, which would otherwise land on this line
              once the panel is narrow. */}
          <p className="pr-20 font-semibold">Two masses, one number.</p>
          <p className="mt-1 text-sm/6">
            Numerically equal, but not the same thing: one is the mass of a single particle, the
            other the mass of <Sci mantissa="6.022" exponent="23" /> of them.
          </p>
        </div>

        <table className="mt-5 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border-strong">
              <th
                scope="col"
                className="px-2 py-2 font-sans text-xs font-semibold tracking-wide text-text-muted uppercase"
              >
                Quantity
              </th>
              <th
                scope="col"
                className="px-2 py-2 font-sans text-xs font-semibold tracking-wide text-text-muted uppercase"
              >
                What it describes
              </th>
              <th
                scope="col"
                className="px-2 py-2 font-sans text-xs font-semibold tracking-wide text-text-muted uppercase"
              >
                Unit
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border">
              <th scope="row" className="px-2 py-2 font-normal">
                Atomic mass
              </th>
              <td className="px-2 py-2">
                mass of <strong className="font-semibold">one atom</strong>
              </td>
              <td className="px-2 py-2 font-mono text-xs">u</td>
            </tr>
            <tr>
              <th scope="row" className="px-2 py-2 font-normal">
                Molar mass (<Var>M</Var>)
              </th>
              <td className="px-2 py-2">
                mass of <strong className="font-semibold">one mole</strong>
              </td>
              <td className="px-2 py-2 font-mono text-xs">g·mol⁻¹</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-6 flex flex-col gap-3">
          <p className="text-center text-lg">
            <Var>n</Var> ={' '}
            <span className="lumen-frac">
              <span>
                <Var>m</Var>
              </span>
              <span>
                <Var>M</Var>
              </span>
            </span>
          </p>
          <div className="border-l-2 border-border pl-4 font-sans text-sm">
            <p className="mb-1.5 text-text-muted">where:</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {[
                ['n', 'amount', 'mol'],
                ['m', 'mass', 'g'],
                ['M', 'molar mass', 'g·mol⁻¹'],
              ].map(([symbol, meaning, units]) => (
                <div key={symbol} className="contents">
                  <dt className="text-right font-medium text-text">
                    <Var>{symbol}</Var>
                  </dt>
                  <dd className="text-text-muted">
                    {meaning}
                    <span className="text-text-faint"> · </span>
                    <span className="font-mono text-xs">{units}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A single-letter variable, set the way the maths renderer sets one: serif, italic. */
function Var({ children }: { children: React.ReactNode }) {
  return <em className="font-serif italic">{children}</em>;
}

/** Scientific notation without a maths library — a real superscript, not a caret. */
function Sci({ mantissa, exponent }: { mantissa: string; exponent: string }) {
  return (
    <span className="whitespace-nowrap">
      {mantissa} × 10<sup>{exponent}</sup>
    </span>
  );
}
