/**
 * Many files, one lesson (01-PRODUCT.md §2 step 2: "multi-shot → one lesson").
 *
 * A student photographs four whiteboards, or has the teacher's PDF plus their own Word notes plus
 * a picture of the worked example. That is one lesson, and the model should see it as one
 * continuous set of notes. So every source is parsed independently and then concatenated in the
 * order the student added them, with each block keeping the `pageRef` that says where it came
 * from — which is what lets the review screen show provenance and lets "split into two lessons"
 * cut somewhere meaningful.
 */
import { MAX_CHARS } from './limits';
import { countChars } from './normalize';
import type { ExtractedAsset, ExtractedBlock, ExtractedDoc } from './types';

export function emptyDoc(): ExtractedDoc {
  return { blocks: [], assets: [], meta: { charCount: 0, pageCount: 0, sourceFiles: [] } };
}

export function mergeDocs(docs: ExtractedDoc[]): ExtractedDoc {
  const blocks = docs.flatMap((doc) => doc.blocks);
  const assets = docs.flatMap((doc) => doc.assets);
  return {
    blocks,
    assets,
    meta: {
      charCount: countChars(blocks.filter((block) => block.kind !== 'image')),
      pageCount: docs.reduce((total, doc) => total + doc.meta.pageCount, 0),
      sourceFiles: docs.flatMap((doc) => doc.meta.sourceFiles),
    },
  };
}

/** Recomputes `meta` after the student has edited, deleted, reordered or split. */
export function recount(doc: ExtractedDoc): ExtractedDoc {
  const usedSources = new Set(doc.blocks.map((block) => block.pageRef.sourceId));
  const sourceFiles = doc.meta.sourceFiles.filter((source) => usedSources.has(source.id));
  const pages = new Set(
    doc.blocks.map((block) => `${block.pageRef.sourceId}:${block.pageRef.page ?? 1}`),
  );
  return {
    ...doc,
    assets: keepReferencedAssets(doc.blocks, doc.assets),
    meta: {
      charCount: countChars(doc.blocks.filter((block) => block.kind !== 'image')),
      pageCount: pages.size,
      sourceFiles,
    },
  };
}

function keepReferencedAssets(
  blocks: ExtractedBlock[],
  assets: ExtractedAsset[],
): ExtractedAsset[] {
  const referenced = new Set(blocks.map((block) => block.assetId).filter(Boolean));
  return assets.filter((asset) => referenced.has(asset.id));
}

/**
 * "These are two lessons" — cuts at a block boundary. The first half keeps the draft the student
 * is looking at; the second becomes a new one they can come back to.
 */
export function splitDoc(doc: ExtractedDoc, index: number): [ExtractedDoc, ExtractedDoc] {
  const cut = Math.max(1, Math.min(doc.blocks.length - 1, index));
  const head = { ...doc, blocks: doc.blocks.slice(0, cut) };
  const tail = { ...doc, blocks: doc.blocks.slice(cut) };
  return [recount(head), recount(tail)];
}

export interface CapResult {
  blocks: ExtractedBlock[];
  /** Blocks dropped from the end because the lesson ran past `MAX_CHARS`. */
  dropped: number;
}

/**
 * The character cap (02-ARCHITECTURE.md §7), applied from the end.
 *
 * Not called while the student is reviewing — they get a warning and the chance to delete what
 * they do not need, which is always a better cut than ours. This runs only if they proceed
 * anyway, and the block boundary is where it cuts so no sentence is severed mid-clause.
 */
export function capBlocks(blocks: ExtractedBlock[], max = MAX_CHARS): CapResult {
  let total = 0;
  const kept: ExtractedBlock[] = [];
  for (const block of blocks) {
    const size = block.kind === 'image' ? 0 : block.text.length;
    if (total + size > max && kept.length > 0) break;
    total += size;
    kept.push(block);
  }
  return { blocks: kept, dropped: blocks.length - kept.length };
}
