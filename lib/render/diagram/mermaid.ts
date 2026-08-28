'use client';

// Type-only: erased at compile time, so mermaid stays out of every static bundle.
import type * as MermaidNamespace from 'mermaid';

import type { ThemeTokens } from '@/lib/design/use-theme-tokens';

/**
 * Mermaid, dynamically imported and themed from our tokens (03-DESIGN.md §9, 06 §1).
 *
 * Two rules the rest of the app depends on:
 *   1. A diagram that will not parse is *dropped*, and its caption survives as a text note. A
 *      student must never be shown a red Mermaid error box in the middle of their chemistry.
 *   2. The source is generated text, so only a short list of diagram types is allowed through and
 *      the node count is capped. An unbounded mindmap is a denial-of-service on the main thread.
 */

/** 06 §1. Anything not on this list is skipped rather than rendered. */
const ALLOWED_TYPES = [
  'flowchart',
  'graph',
  'sequenceDiagram',
  'timeline',
  'mindmap',
  'pie',
  'xychart-beta',
  'stateDiagram',
  'stateDiagram-v2',
] as const;

const MAX_NODES = 14;

type MermaidModule = typeof MermaidNamespace.default;

let loader: Promise<MermaidModule> | null = null;

async function loadMermaid(): Promise<MermaidModule> {
  loader ??= import('mermaid').then((module) => module.default);
  return loader;
}

/** The first meaningful line names the diagram type. Comments and blank lines do not count. */
export function diagramType(source: string): string | null {
  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%%')) continue;
    return trimmed.split(/[\s{]/)[0] ?? null;
  }
  return null;
}

/**
 * Approximate node count: identifiers that sit next to a shape bracket or an edge operator. It
 * over-counts a little on labelled edges, which is the right direction to be wrong in for a cap.
 */
export function countNodes(source: string): number {
  const ids = source.match(/[A-Za-z_][\w-]*(?=\s*(?:\[|\(|\{|--|==|-\.|-->))/g) ?? [];
  return new Set(ids).size;
}

export function isRenderable(source: string): boolean {
  const type = diagramType(source);
  if (!type || !(ALLOWED_TYPES as readonly string[]).includes(type)) return false;
  return countNodes(source) <= MAX_NODES;
}

/**
 * Maps our palette onto Mermaid's theme variables. Mermaid resolves these to literal colors at
 * render time and bakes them into the SVG, which is exactly why the diagram has to be re-rendered
 * when the theme flips rather than simply inheriting — see `DiagramBlock`.
 */
function themeVariables(tokens: ThemeTokens) {
  return {
    background: tokens['--bg'],
    mainBkg: tokens['--accent-weak'],
    primaryColor: tokens['--accent-weak'],
    primaryTextColor: tokens['--text'],
    primaryBorderColor: tokens['--accent'],
    secondaryColor: tokens['--bg-sunken'],
    secondaryTextColor: tokens['--text'],
    secondaryBorderColor: tokens['--border-strong'],
    tertiaryColor: tokens['--bg-raised'],
    tertiaryTextColor: tokens['--text'],
    tertiaryBorderColor: tokens['--border-strong'],
    lineColor: tokens['--border-strong'],
    textColor: tokens['--text'],
    titleColor: tokens['--text'],
    nodeBorder: tokens['--accent'],
    nodeTextColor: tokens['--text'],
    clusterBkg: tokens['--bg-sunken'],
    clusterBorder: tokens['--border'],
    edgeLabelBackground: tokens['--bg'],
    fontFamily: tokens['--font-sans'],
    fontSize: '15px',
  };
}

export interface DiagramRender {
  svg: string | null;
  /** Set when the source was rejected or failed to parse — the caller keeps the caption only. */
  error: string | null;
}

export async function renderDiagram(
  id: string,
  source: string,
  tokens: ThemeTokens,
): Promise<DiagramRender> {
  if (!isRenderable(source)) {
    return { svg: null, error: `Unsupported or oversized diagram: ${diagramType(source) ?? '?'}` };
  }

  try {
    const mermaid = await loadMermaid();
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      themeVariables: themeVariables(tokens),
      flowchart: { htmlLabels: true, curve: 'basis' },
      // The source is model output. `strict` sanitises labels and blocks script and click events.
      securityLevel: 'strict',
      fontFamily: tokens['--font-sans'],
    });
    const { svg } = await mermaid.render(id, source);
    return { svg, error: null };
  } catch (error) {
    return { svg: null, error: error instanceof Error ? error.message : 'Could not render' };
  }
}
