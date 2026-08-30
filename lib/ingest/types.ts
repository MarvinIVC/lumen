/**
 * The extraction model (02-ARCHITECTURE.md §2, 04-AI-ENGINE.md §4.5).
 *
 * Everything a parser produces lands in this shape, and everything downstream — the review
 * editor, the draft store, and eventually the `RUN_INSTRUCTION` block — reads only this shape.
 * Three files and a photo become one `ExtractedDoc`, because the unit the student thinks in is a
 * *lesson*, not a file (01-PRODUCT.md §2 step 2).
 *
 * The text of a block is lightweight markdown rather than rich structure: `## ` for a heading,
 * `- ` for a list item, pipes for a table row. That is what `04` §4.5 hands the model, it is what
 * a textarea can hold without a schema, and it survives a round trip through the student's edits.
 */

/** Where a block came from, in the words the review screen shows: "notes.docx · p3". */
export interface PageRef {
  sourceId: string;
  /** 1-based, for paginated sources. Absent for a photo or a paste. */
  page?: number;
  label: string;
}

export type BlockKind = 'heading' | 'paragraph' | 'list' | 'table' | 'image' | 'raw';

export interface ExtractedBlock {
  id: string;
  kind: BlockKind;
  /** Lightweight markdown. For `image`, the placeholder `[IMAGE: <assetId>]`. */
  text: string;
  /** 1–6, headings only. */
  level?: number;
  pageRef: PageRef;
  /**
   * No text layer / not yet recognised. The review screen offers OCR here and the enhance call
   * must not be made while any block still carries it unresolved (the student decides).
   */
  needsOCR?: boolean;
  assetId?: string;
  /** The student edited this block. Nothing re-normalises it afterwards. */
  edited?: boolean;
}

export type AssetKind = 'embedded' | 'page-thumb' | 'photo';

export interface ExtractedAsset {
  id: string;
  sourceId: string;
  kind: AssetKind;
  mime: string;
  blob: Blob;
  width: number;
  height: number;
  /** From the source document where it had one; the model writes the rest later. */
  alt?: string;
  pageRef?: PageRef;
}

export type SourceKind = 'docx' | 'pdf' | 'image' | 'text' | 'paste';

export interface SourceFile {
  id: string;
  name: string;
  /** Bytes of the original file. 0 for a paste. */
  size: number;
  mime: string;
  kind: SourceKind;
  pageCount?: number;
  charCount: number;
  /** Which parser build produced this, so a re-parse can be detected after an upgrade. */
  parserVersion: string;
}

export interface ExtractedMeta {
  charCount: number;
  pageCount: number;
  sourceFiles: SourceFile[];
}

export interface ExtractedDoc {
  blocks: ExtractedBlock[];
  assets: ExtractedAsset[];
  meta: ExtractedMeta;
}

/* -------------------------------------------------------------------------- *
 * Parsers
 * -------------------------------------------------------------------------- */

export interface ParseContext {
  /** 0–1. Called often enough to animate, rarely enough not to thrash React. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  /** Stable id for the source, so blocks and assets agree on it before parsing finishes. */
  sourceId: string;
  /**
   * For an encrypted PDF. Asked for on the review screen and used here in the browser only —
   * 01-PRODUCT.md §5 is explicit that it is never sent anywhere.
   */
  password?: string;
}

export interface Parser {
  id: SourceKind;
  /** Extensions this parser claims, lowercase and dotted. */
  extensions: readonly string[];
  parse: (file: File, context: ParseContext) => Promise<ExtractedDoc>;
}

/**
 * A parse that failed for a reason the student can act on. Anything else is a bug and is reported
 * as one — 01-PRODUCT.md §5's last row: never a raw stack trace.
 */
export class IngestError extends Error {
  override name = 'IngestError';
  /** Machine-readable, so the UI can pick copy and an affordance rather than print a string. */
  readonly code:
    | 'unsupported'
    | 'too-large'
    | 'too-many-pages'
    | 'too-much-text'
    // A PDF that will open once the student supplies the password. The only code the review
    // screen offers a password box for, because it is the only one where a password helps.
    | 'encrypted'
    // A pre-2007 `.doc`, or a Word file encrypted with Office's own scheme. We cannot open either,
    // and asking for a password would be a dialog that cannot succeed.
    | 'legacy-format'
    | 'empty'
    | 'corrupt';
  /** Whether offering "paste it instead" makes sense for this failure. */
  readonly offerPaste: boolean;

  constructor(code: IngestError['code'], message: string, offerPaste = true) {
    super(message);
    this.code = code;
    this.offerPaste = offerPaste;
  }
}
