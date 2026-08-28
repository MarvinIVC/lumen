'use client';

import { useEffect, useId, useState } from 'react';

import { cn } from '@/lib/utils/cn';
import { useThemeTokens } from '@/lib/design/use-theme-tokens';
import type { DiagramBlock as DiagramBlockType } from '@/lib/ai/schema';

import { DataChart } from '../charts/data-chart';
import { FigureWithCaption } from './figure-with-caption';
import { renderDiagram } from '../diagram/mermaid';

export interface DiagramBlockProps {
  block: DiagramBlockType;
  figureNumber: number;
  className?: string;
}

/**
 * A diagram is either Mermaid source or a `ChartSpec`. Both arrive themed from the same
 * `useThemeTokens()` hook (03-DESIGN.md §9), but they get there differently and it matters:
 *
 *   Charts read CSS variables directly, so a theme flip re-paints them with no JavaScript at all.
 *   Mermaid bakes literal colors into the SVG it generates, so the diagram must be re-rendered —
 *   which is what `themeVersion` in the dependency list below is for.
 *
 * If Mermaid cannot parse the source, the block collapses to its caption as a note rather than
 * rendering an error box (06 §1). The caption usually still says something useful.
 */
export function DiagramBlock({ block, figureNumber, className }: DiagramBlockProps) {
  if (block.engine === 'chart' && block.spec) {
    return (
      <FigureWithCaption
        number={figureNumber}
        caption={block.caption}
        illustrative={block.spec.illustrative}
        className={className}
      >
        <DataChart spec={block.spec} alt={block.alt} />
      </FigureWithCaption>
    );
  }

  if (block.engine === 'mermaid' && block.source) {
    return (
      <MermaidFigure
        source={block.source}
        caption={block.caption}
        alt={block.alt}
        figureNumber={figureNumber}
        className={className}
      />
    );
  }

  return <CaptionOnly caption={block.caption} className={className} />;
}

function MermaidFigure({
  source,
  caption,
  alt,
  figureNumber,
  className,
}: {
  source: string;
  caption: string;
  alt: string;
  figureNumber: number;
  className?: string;
}) {
  const { tokens, themeVersion } = useThemeTokens();
  const reactId = useId();
  // Mermaid uses the id to namespace the styles it injects; the colons React puts in useId ids
  // are not valid in a CSS selector.
  const domId = `mermaid-${reactId.replace(/[^a-zA-Z0-9]/g, '')}`;

  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!themeVersion) return;
    let active = true;
    void renderDiagram(domId, source, tokens).then((result) => {
      if (!active) return;
      setSvg(result.svg);
      setFailed(result.svg === null);
    });
    return () => {
      active = false;
    };
  }, [domId, source, tokens, themeVersion]);

  if (failed) return <CaptionOnly caption={caption} className={className} />;

  return (
    <FigureWithCaption number={figureNumber} caption={caption} className={className}>
      {svg ? (
        <div
          role="img"
          aria-label={alt}
          className="lumen-diagram w-full max-w-full"
          // Mermaid's own output, produced with securityLevel 'strict' so labels are sanitised.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div
          className="h-40 w-full animate-breathe rounded-note bg-bg-sunken"
          aria-label={alt}
          role="img"
        />
      )}
    </FigureWithCaption>
  );
}

/** What is left when a visual cannot be drawn: the sentence it was going to illustrate. */
function CaptionOnly({ caption, className }: { caption: string; className?: string }) {
  return (
    <p
      className={cn(
        'my-5 border-l-2 border-border pl-4 font-sans text-sm text-text-muted',
        className,
      )}
    >
      {caption}
    </p>
  );
}
