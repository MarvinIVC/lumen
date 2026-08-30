import { describe, expect, it } from 'vitest';

import { lintMermaid, lintSmiles } from '@/lib/ai/lint';

/**
 * These two linters decide whether a diagram or a structure survives to the page, so both of their
 * failure directions cost something real: too lax and the renderer shows a broken box, too strict
 * and a good figure silently disappears from a student's note. The node-count case below is the
 * one that was wrong first time — every word inside a label counted as a node.
 */
describe('mermaid', () => {
  it('accepts an ordinary labelled flowchart', () => {
    const source = [
      'flowchart TD',
      '  bind[Three Na+ bind inside the cell] --> phos[ATP phosphorylates the pump]',
      '  phos --> shape[The pump changes shape and opens outward]',
      '  shape --> out[Three Na+ are released outside]',
      '  out --> k[Two K+ bind from outside]',
      '  k --> in[Two K+ are released inside]',
    ].join('\n');
    expect(lintMermaid(source)).toEqual({ ok: true });
  });

  it('accepts labelled edges', () => {
    const source =
      'flowchart LR\n  mass[mass in g] -- divide by M --> mol[moles]\n  mol -- times NA --> n[particles]';
    expect(lintMermaid(source).ok).toBe(true);
  });

  it('rejects a diagram type the renderer will not draw', () => {
    expect(lintMermaid('erDiagram\n  A ||--o{ B : has').ok).toBe(false);
  });

  it('rejects styling, because the app themes diagrams', () => {
    expect(lintMermaid('flowchart TD\n  a --> b\n  style a fill:#f00').ok).toBe(false);
  });

  it('rejects a diagram with too many nodes to read', () => {
    const nodes = Array.from({ length: 20 }, (_, i) => `  n${i} --> m${i}`).join('\n');
    expect(lintMermaid(`flowchart TD\n${nodes}`).ok).toBe(false);
  });
});

describe('smiles', () => {
  it.each([
    ['CCO', 'ethanol'],
    ['c1ccccc1', 'benzene'],
    ['CC(=O)Oc1ccccc1C(=O)O', 'aspirin'],
    ['[Na+].[Cl-]', 'an ionic pair'],
    ['C1CC2CCC1CC2', 'a bridged bicycle'],
  ])('accepts %s (%s)', (smiles) => {
    expect(lintSmiles(smiles).ok).toBe(true);
  });

  it.each([
    ['CC(', 'an unclosed branch'],
    ['CC)', 'an unmatched close'],
    ['c1ccccc', 'an unclosed ring'],
    ['[Na', 'an unclosed bracket'],
    ['a molecule of water', 'prose'],
    ['', 'nothing at all'],
  ])('rejects %s (%s)', (smiles) => {
    expect(lintSmiles(smiles).ok).toBe(false);
  });
});
