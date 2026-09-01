/**
 * What a manually inserted block starts as (phase-05 §12).
 *
 * Every one is a valid block of its type before the student has typed anything — empty strings
 * rather than absent fields, and a plausible skeleton where the shape needs one. The alternative,
 * inserting a partial object and letting the editor fill it in, means the document is briefly
 * invalid, and "briefly" here spans an autosave.
 *
 * They are placeholders, not examples: chemistry that looks real but is wrong would be worse than
 * an empty field, because a student who did not finish editing it would ship it.
 */
import type { Block, BlockType } from '@/lib/ai/schema';

export function blankBlock(type: BlockType): Block {
  const origin = 'student' as const;

  switch (type) {
    case 'formula':
      return {
        type: 'formula',
        latex: '',
        // One empty row, so the required "where" list is visible as a thing to fill in rather than
        // as an absence. 04 §5 fails a formula with no symbol carrying units.
        where: [{ symbol: '', meaning: '', units: '' }],
        useWhen: '',
        origin,
      };
    case 'structure':
      return { type: 'structure', smiles: '', caption: '', alt: '', origin };
    case 'diagram':
      return {
        type: 'diagram',
        engine: 'mermaid',
        source: 'flowchart TD\n  A[Start] --> B[Next]',
        caption: '',
        alt: '',
        origin,
      };
    case 'workedExample':
      return {
        type: 'workedExample',
        problem: '',
        steps: [{ text: '' }],
        answer: '',
        commonMistake: '',
        origin,
      };
    case 'callout':
      return { type: 'callout', kind: 'tip', text: '', origin };
    case 'misconception':
      return { type: 'misconception', wrong: '', right: '', origin };
    case 'table':
      return {
        type: 'table',
        caption: '',
        columns: [{ header: '' }, { header: '' }],
        rows: [['', '']],
        origin,
      };
    case 'marginNote':
      return { type: 'marginNote', kind: 'connection', text: '', origin };
    case 'figure':
      return { type: 'figure', assetId: '', caption: '', alt: '', origin };
    case 'definition':
      return { type: 'definition', term: '', definition: '', origin };
    case 'list':
      return { type: 'list', ordered: false, items: [''], origin };
    case 'paragraph':
      return { type: 'paragraph', text: '', origin };
  }
}
