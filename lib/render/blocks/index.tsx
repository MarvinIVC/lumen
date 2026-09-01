import type { Block } from '@/lib/ai/schema';

import { Callout } from './callout';
import { ChemStructure } from './chem-structure';
import { DiagramBlock } from './diagram-block';
import { Formula } from './formula';
import { FigureWithCaption } from './figure-with-caption';
import { KeyTerm } from './key-term';
import { List } from './list';
import { MarginNote } from '../margin-note';
import { Misconception } from './misconception';
import { Paragraph } from './paragraph';
import { ProvenanceBlock } from '../provenance-mark';
import { Table } from './table';
import { WorkedExample } from './worked-example';

export interface RenderBlockProps {
  block: Block;
  /** Figure numbers are sequential across the whole document, assigned by `NoteDocument`. */
  figureNumber?: number;
  /**
   * Draws the block without its provenance treatment.
   *
   * For callers that provide their own. The editor's node views wrap each atom in a frame carrying
   * the accept/reject controls, and letting this add a second tint inside it produced exactly the
   * nested-containers problem the `selfMarking` branch below exists to avoid — a tinted box, inside
   * a bordered card, inside a tinted box, all saying "added" once.
   */
  bare?: boolean;
}

/**
 * One component per block type (03-DESIGN.md §6), wrapped in its provenance treatment.
 *
 * Margin notes are the exception: they are positioned by the section layout rather than flowing
 * in the text column, so `NoteDocument` pulls them out before it gets here. Reaching this branch
 * means a margin note had no block to anchor to, and inline is the honest fallback.
 */
export function RenderBlock({ block, figureNumber = 1, bare = false }: RenderBlockProps) {
  // A worked example that already shows the student's struck-through line carries its own
  // correction surface. Wrapping it in a second amber panel puts a tint around a bordered card
  // around a tinted strip — three nested containers saying the same thing once.
  const selfMarking =
    bare || (block.type === 'workedExample' && block.studentAttempt !== undefined);

  return selfMarking ? (
    renderBody(block, figureNumber)
  ) : (
    <ProvenanceBlock origin={block.origin}>{renderBody(block, figureNumber)}</ProvenanceBlock>
  );
}

function renderBody(block: Block, figureNumber: number) {
  switch (block.type) {
    case 'paragraph':
      return <Paragraph block={block} />;
    case 'list':
      return <List block={block} />;
    case 'definition':
      return <KeyTerm block={block} />;
    case 'formula':
      return <Formula block={block} />;
    case 'workedExample':
      return <WorkedExample block={block} />;
    case 'diagram':
      return <DiagramBlock block={block} figureNumber={figureNumber} />;
    case 'structure':
      return <ChemStructure block={block} figureNumber={figureNumber} />;
    case 'callout':
      return <Callout block={block} />;
    case 'misconception':
      return <Misconception block={block} />;
    case 'table':
      return <Table block={block} />;
    case 'marginNote':
      return <MarginNote block={block} />;
    case 'figure':
      return (
        <FigureWithCaption number={figureNumber} caption={block.caption}>
          {/* Uploaded assets land in phase-03; until then the slot is explicit, not silent. */}
          <div
            role="img"
            aria-label={block.alt}
            className="grid h-40 w-full place-items-center rounded-note bg-bg-sunken font-sans text-sm text-text-muted"
          >
            {block.alt}
          </div>
        </FigureWithCaption>
      );
  }
}

/** True for the block types that consume a figure number. */
export function isFigure(block: Block): boolean {
  return block.type === 'diagram' || block.type === 'structure' || block.type === 'figure';
}
