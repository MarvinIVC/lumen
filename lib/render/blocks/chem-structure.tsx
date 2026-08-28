'use client';

import { useEffect, useRef, useState } from 'react';

import { useThemeTokens } from '@/lib/design/use-theme-tokens';
import type { StructureBlock } from '@/lib/ai/schema';

import { FigureWithCaption } from './figure-with-caption';
import { drawStructure } from '../structure/smiles';

/**
 * A skeletal structure from a SMILES string, drawn as SVG so it prints as vector (06 §1).
 *
 * A structure we cannot draw is removed rather than approximated — in chemistry a wrong structure
 * is worse than no structure. Phase-04's validator turns the same failure into an open question
 * ("we couldn't render the structure for X") so the gap is visible rather than silent.
 */
export function ChemStructure({
  block,
  figureNumber,
  className,
}: {
  block: StructureBlock;
  figureNumber: number;
  className?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { tokens, themeVersion } = useThemeTokens();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const target = svgRef.current;
    if (!target || !themeVersion) return;

    let active = true;
    // smiles-drawer appends into the element, so a re-theme has to start from an empty one.
    target.replaceChildren();
    void drawStructure(block.smiles, target, tokens).then((result) => {
      if (active) setFailed(!result.ok);
    });
    return () => {
      active = false;
    };
  }, [block.smiles, tokens, themeVersion]);

  if (failed) return null;

  return (
    <FigureWithCaption number={figureNumber} caption={block.caption} className={className}>
      <svg
        ref={svgRef}
        role="img"
        aria-label={block.alt}
        className="lumen-structure h-auto w-full max-w-xs"
      />
    </FigureWithCaption>
  );
}
