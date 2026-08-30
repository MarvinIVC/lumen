import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The workspace store, exercised without a browser.
 *
 * `getDb()` returns `null` when there is no `indexedDB`, which is the Safari-private-browsing path
 * and is also exactly what node looks like — so the store runs here with persistence turned off
 * and every state transition is testable.
 *
 * The race below is the reason this file exists. It only reproduced against the deployed Worker,
 * where the pack manifest is a chunk fetch rather than an instant local import, so it needs a
 * deterministic home rather than a lucky end-to-end run.
 */
/**
 * A gate every `matchPack` call waits behind, so the pack lookup can be held open for as long as a
 * test needs and then released for all of it at once. A per-call resolver is not enough: editing
 * the context starts a second lookup, and the two have to be releasable together.
 */
let openGate!: () => void;
let gate!: Promise<void>;
const closeGate = () => {
  gate = new Promise<void>((resolve) => {
    openGate = resolve;
  });
};
closeGate();

vi.mock('@/lib/curriculum/load', () => ({
  matchPack: vi.fn(async () => {
    await gate;
    return null;
  }),
  listPacks: vi.fn(async () => []),
}));

const { useDraftStore, titleFrom, draftText } = await import('@/lib/store/draft-store');

const RAW = [
  '# AP Chem Unit 1',
  '',
  '## 1.1',
  '',
  'Atomic mass = molar mass. A mole is an amount.',
  '',
  '- Mass of 1 atom (in amu)',
  '- Mass of 1 mole (in grams)',
].join('\n');

beforeEach(() => {
  closeGate();
  useDraftStore.setState({ draft: null, rows: [], assets: new Map(), hydrated: false });
  useDraftStore.getState().createDraft();
  useDraftStore.getState().addPaste(RAW);
});

describe('detection', () => {
  it('fills the context from the notes', async () => {
    const detection = useDraftStore.getState().runDetection();
    openGate();
    await detection;

    const draft = useDraftStore.getState().draft;
    expect(draft?.context).toMatchObject({ subject: 'Chemistry', course: 'AP Chemistry' });
    expect(draft?.detection.edited).toBe(false);
  });

  it('never overwrites what the student typed while it was still running', async () => {
    // Detection starts, and stalls on the pack lookup — the deployed timing, made deterministic.
    const detection = useDraftStore.getState().runDetection();

    // The student answers the question the screen is asking them.
    useDraftStore.getState().setContext({ unit: 'Unit 9 — Survives a reload' });
    expect(useDraftStore.getState().draft?.detection.edited).toBe(true);

    openGate();
    await detection;

    const draft = useDraftStore.getState().draft;
    expect(draft?.context.unit).toBe('Unit 9 — Survives a reload');
    // And it is still marked as theirs, so nothing re-detects over it on the next render.
    expect(draft?.detection.edited).toBe(true);
    expect(draft?.detection.source).toBe('user');
  });

  it('does not run at all once the context is the student’s', async () => {
    useDraftStore.getState().setContext({ subject: 'Biology' });
    openGate();
    await useDraftStore.getState().runDetection();
    expect(useDraftStore.getState().draft?.context.subject).toBe('Biology');
  });
});

describe('blocks', () => {
  it('edits, deletes, merges and moves', () => {
    const ids = () => useDraftStore.getState().draft!.doc.blocks.map((block) => block.id);
    const texts = () => useDraftStore.getState().draft!.doc.blocks.map((block) => block.text);
    const [first, second] = ids();

    useDraftStore.getState().setBlockText(first!, '# Edited');
    expect(texts()[0]).toBe('# Edited');
    expect(useDraftStore.getState().draft!.doc.blocks[0]!.edited).toBe(true);

    useDraftStore.getState().moveBlock(first!, 1);
    expect(ids()[1]).toBe(first);

    // Merging folds a block into the one above it, so the survivor keeps the *upper* block's id.
    useDraftStore.getState().mergeBlockUp(first!);
    expect(texts()[0]).toContain('# Edited');
    expect(ids()[0]).toBe(second);
    expect(ids()).not.toContain(first);

    const remaining = ids().length;
    useDraftStore.getState().deleteBlock(ids()[0]!);
    expect(ids()).toHaveLength(remaining - 1);
  });

  it('re-counts the lesson after every change', () => {
    const before = useDraftStore.getState().draft!.doc.meta.charCount;
    useDraftStore.getState().deleteBlock(useDraftStore.getState().draft!.doc.blocks[1]!.id);
    expect(useDraftStore.getState().draft!.doc.meta.charCount).toBeLessThan(before);
  });
});

describe('creating the note', () => {
  it('carries the confirmed extraction and says where it came from', async () => {
    const detection = useDraftStore.getState().runDetection();
    openGate();
    await detection;

    const noteId = await useDraftStore.getState().createNote();
    expect(noteId).toMatch(/^nte_/);
    // The draft is done rather than deleted — `/app/note/:id` offers "back to review".
    expect(useDraftStore.getState().draft?.status).toBe('ready');
  });
});

describe('helpers', () => {
  it('titles a lesson from its first heading', () => {
    expect(titleFrom(useDraftStore.getState().draft!.doc.blocks)).toBe('AP Chem Unit 1');
  });

  it('gives the detector the notes without the image placeholders', () => {
    const blocks = useDraftStore.getState().draft!.doc.blocks;
    const text = draftText([
      ...blocks,
      {
        id: 'img',
        kind: 'image',
        text: '[IMAGE: ast_1]',
        pageRef: { sourceId: 's', label: 'photo.jpg' },
      },
    ]);
    expect(text).not.toContain('[IMAGE:');
    expect(text).toContain('AP Chem Unit 1');
  });
});
