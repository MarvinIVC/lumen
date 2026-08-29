'use client';

import { CorrectionsPanel } from '@/lib/render/corrections-panel';
import { ProvenanceBlock } from '@/lib/render/provenance-mark';
import { ReadingModeProvider } from '@/lib/render/reading-mode';
import { goldFixture } from '@/lib/render/fixture/gold';

/**
 * Step two of "how it works", shown with the actual components rather than a picture of them
 * (03-DESIGN.md §8.3 — the provenance marking and the corrections panel *are* the trust story).
 *
 * `highlight` mode on purpose: the marks are calm inside a real note, but this is a two-second
 * explanation of what a mark even is, so it wants the loud treatment.
 *
 * Lazily imported, like the full note — `CorrectionsPanel` pulls in the inline markdown renderer
 * and the count-up animation, neither of which belongs in a first load.
 */
export default function TrustNote({
  provenanceCaption,
  correctionsCaption,
}: {
  provenanceCaption: string;
  correctionsCaption: string;
}) {
  const doc = goldFixture();

  return (
    <ReadingModeProvider defaultMode="highlight">
      <div className="lumen-note">
        <ProvenanceBlock origin="ai-corrected">
          <p className="font-semibold">Two masses, one number.</p>
          <p className="mt-1 text-sm/6">
            They are numerically equal but they are not the same thing: one is the mass of a single
            particle, the other the mass of a mole of them.
          </p>
        </ProvenanceBlock>
        <p className="mt-3 font-sans text-sm text-text-muted">{provenanceCaption}</p>

        <CorrectionsPanel corrections={doc.corrections.slice(0, 2)} />
        <p className="mt-4 font-sans text-sm text-text-muted">{correctionsCaption}</p>
      </div>
    </ReadingModeProvider>
  );
}
