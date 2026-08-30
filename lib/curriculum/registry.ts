/**
 * The packs, statically. **Server and edge only — never import this from client code.**
 *
 * `load.ts` reaches its packs with a dynamic `import()` of a JSON file, which is right in the
 * browser: the review screen only needs the manifest, and a pack is a lazy chunk fetched if and
 * when it matches. It is wrong in Deno, where a template-literal dynamic import of JSON cannot be
 * statically resolved and the edge function would boot with no packs at all.
 *
 * So the server side declares them: one static import per pack, with the JSON import attribute
 * that Deno, webpack and Vite all understand. Adding a pack means adding a line here and a line in
 * `manifest.json`, and `tests/unit/pack-registry.test.ts` fails if the two disagree.
 */
import manifest from './manifest.json' with { type: 'json' };
import apChemistry from './packs/ap-chemistry.json' with { type: 'json' };
import type { PackSource, PackSummary } from './load.ts';
import type { CurriculumPack } from './types.ts';

const PACKS: Record<string, CurriculumPack> = {
  'ap-chemistry': apChemistry as unknown as CurriculumPack,
};

export const packIds = Object.keys(PACKS);

export const staticPackSource: PackSource = {
  list: () => Promise.resolve((manifest as { packs: PackSummary[] }).packs ?? []),
  load: (id: string) => Promise.resolve(PACKS[id] ?? null),
};
