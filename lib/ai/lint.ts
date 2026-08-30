/**
 * Structural checks for the two block types whose real validators are browser libraries.
 *
 * `mermaid` and `smiles-drawer` are aliased to `false` in the server compilation (see
 * `next.config.ts` and the phase-03 note in `docs/PHASE-LOG.md`), and neither would run in the
 * Deno edge function anyway. So the pipeline validates these two block types *structurally* —
 * enough to catch the model emitting a diagram type the renderer refuses, a graph with sixty
 * nodes, or a SMILES string with unbalanced brackets — and the renderer keeps its own parse-time
 * check, where it already drops what it cannot draw (06 §1).
 *
 * Two layers, on purpose: this one stops bad blocks being stored, that one stops bad blocks being
 * rendered. Neither is a substitute for the other.
 */

/** The diagram types the renderer accepts (06-RENDER-EXPORT-SAFETY.md §1). */
const ALLOWED_DIAGRAMS = [
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

/** 06 §1 caps node count at ~14 "at validation"; the rubric asks the model for ≤12. */
const MAX_NODES = 14;

export interface LintResult {
  ok: boolean;
  reason?: string;
}

export function lintMermaid(source: string): LintResult {
  const trimmed = source.trim();
  if (!trimmed) return { ok: false, reason: 'empty diagram' };

  const first = trimmed.split('\n')[0]?.trim() ?? '';
  const kind = ALLOWED_DIAGRAMS.find(
    (allowed) => first === allowed || first.startsWith(`${allowed} `),
  );
  if (!kind) return { ok: false, reason: `unsupported diagram type: ${first.slice(0, 24)}` };

  // Styling is the app's job — a themed diagram that carries its own colours fights the theme.
  if (/^\s*(style|classDef|linkStyle|class)\s/m.test(trimmed)) {
    return { ok: false, reason: 'contains styling directives' };
  }
  if (/<\s*script/i.test(trimmed)) return { ok: false, reason: 'contains markup' };

  if (kind === 'flowchart' || kind === 'graph') {
    const nodes = new Set<string>();
    for (const line of trimmed.split('\n').slice(1)) {
      // Strip the label text first. Without this every word inside `a[Three Na+ bind inside]`
      // counts as its own node, and a perfectly ordinary six-box diagram is rejected for having
      // twenty-one — which is exactly how this was wrong the first time.
      const bare = line
        .replace(/\[[^\]]*\]/g, '')
        .replace(/\([^)]*\)/g, '')
        .replace(/\{[^}]*\}/g, '')
        .replace(/\|[^|]*\|/g, '');
      for (const id of bare.matchAll(/(^|\s|-->|---|==>|-\.->|--)\s*([A-Za-z_][\w-]*)/g)) {
        const name = id[2];
        if (
          name &&
          !['subgraph', 'end', 'direction', 'TD', 'LR', 'TB', 'RL', 'BT'].includes(name)
        ) {
          nodes.add(name);
        }
      }
    }
    if (nodes.size > MAX_NODES)
      return { ok: false, reason: `${nodes.size} nodes exceeds ${MAX_NODES}` };
  }

  return { ok: true };
}

/**
 * A syntactic plausibility check for SMILES — not a parse.
 *
 * smiles-drawer is the authority and runs in the browser; this catches the failures a model
 * actually produces: unbalanced brackets, an unclosed ring, or prose where a structure should be.
 */
const ORGANIC = ['Cl', 'Br', 'B', 'C', 'N', 'O', 'P', 'S', 'F', 'I', 'b', 'c', 'n', 'o', 'p', 's'];

export function lintSmiles(smiles: string): LintResult {
  const trimmed = smiles.trim();
  if (!trimmed) return { ok: false, reason: 'empty structure' };
  if (/\s/.test(trimmed)) return { ok: false, reason: 'contains whitespace' };
  if (trimmed.length > 400) return { ok: false, reason: 'implausibly long' };

  let parens = 0;
  let inBracket = false;
  const rings = new Map<string, number>();

  for (let i = 0; i < trimmed.length; i += 1) {
    const char = trimmed.charAt(i);
    if (inBracket) {
      if (char === '[') return { ok: false, reason: 'nested [' };
      if (char === ']') inBracket = false;
      continue;
    }
    if (char === '[') inBracket = true;
    else if (char === ']') return { ok: false, reason: 'unmatched ]' };
    else if (char === '(') parens += 1;
    else if (char === ')') {
      parens -= 1;
      if (parens < 0) return { ok: false, reason: 'unmatched )' };
    } else if (/\d/.test(char)) {
      rings.set(char, (rings.get(char) ?? 0) + 1);
    } else if (char === '%') {
      const label = trimmed.slice(i + 1, i + 3);
      if (!/^\d\d$/.test(label)) return { ok: false, reason: 'malformed ring closure' };
      rings.set(label, (rings.get(label) ?? 0) + 1);
      i += 2;
    } else if (!/[=#$:/\\.+\-@]/.test(char)) {
      const two = trimmed.slice(i, i + 2);
      if (ORGANIC.includes(two)) i += 1;
      else if (!ORGANIC.includes(char))
        return { ok: false, reason: `unexpected character '${char}'` };
    }
  }

  if (inBracket) return { ok: false, reason: 'unclosed [' };
  if (parens !== 0) return { ok: false, reason: 'unclosed (' };
  for (const [label, count] of rings) {
    if (count % 2 !== 0) return { ok: false, reason: `unclosed ring bond ${label}` };
  }
  if (!ORGANIC.some((atom) => trimmed.includes(atom)) && !trimmed.includes('[')) {
    return { ok: false, reason: 'no atoms' };
  }

  return { ok: true };
}
