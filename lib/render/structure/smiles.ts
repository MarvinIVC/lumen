'use client';

import type { ThemeTokens } from '@/lib/design/use-theme-tokens';

/**
 * smiles-drawer, dynamically imported and themed (03-DESIGN.md §9, 06 §1). SVG output, so a
 * structure stays crisp in the printed PDF instead of turning into a 96dpi smudge.
 *
 * An unparseable SMILES string is dropped by the caller and turned into an open question — we say
 * "we could not draw this" rather than showing a wrong molecule, which in chemistry is worse than
 * showing none.
 */

interface SmilesDrawerModule {
  SvgDrawer: new (options: unknown) => {
    draw: (tree: unknown, target: SVGElement | string, theme: string) => void;
  };
  parse: (
    smiles: string,
    onSuccess: (tree: unknown) => void,
    onError: (error: unknown) => void,
  ) => void;
}

let loader: Promise<SmilesDrawerModule> | null = null;

async function loadSmilesDrawer(): Promise<SmilesDrawerModule> {
  loader ??= import('smiles-drawer').then(
    (module) => (module.default ?? module) as unknown as SmilesDrawerModule,
  );
  return loader;
}

/**
 * Bonds and carbon take the ink color; heteroatoms keep just enough hue to be distinguishable at
 * a glance without turning the structure into a colour-by-numbers. `BACKGROUND` is transparent so
 * the molecule sits on the page, not in a white box (which would be glaring in dark mode).
 */
function theme(tokens: ThemeTokens): Record<string, string> {
  return {
    C: tokens['--text'],
    N: tokens['--link'],
    O: tokens['--danger'],
    S: tokens['--warning'],
    P: tokens['--warning'],
    F: tokens['--accent'],
    CL: tokens['--accent'],
    BR: tokens['--accent'],
    I: tokens['--accent'],
    B: tokens['--text-muted'],
    SI: tokens['--text-muted'],
    H: tokens['--text'],
    BACKGROUND: 'transparent',
  };
}

export async function drawStructure(
  smiles: string,
  target: SVGElement,
  tokens: ThemeTokens,
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const smilesDrawer = await loadSmilesDrawer();
    const drawer = new smilesDrawer.SvgDrawer({
      width: 320,
      height: 220,
      bondThickness: 1.1,
      bondLength: 18,
      atomVisualization: 'default',
      terminalCarbons: false,
      explicitHydrogens: false,
      themes: { lumen: theme(tokens) },
    });

    return await new Promise((resolve) => {
      smilesDrawer.parse(
        smiles,
        (tree) => {
          try {
            drawer.draw(tree, target, 'lumen');
            resolve({ ok: true, error: null });
          } catch (error) {
            resolve({
              ok: false,
              error: error instanceof Error ? error.message : 'Could not draw',
            });
          }
        },
        () => resolve({ ok: false, error: `Could not parse SMILES: ${smiles}` }),
      );
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not load' };
  }
}
