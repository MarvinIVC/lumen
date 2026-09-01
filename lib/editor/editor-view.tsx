'use client';

/**
 * The TipTap editor (phase-05 §8–§12).
 *
 * Loaded only through `next/dynamic({ ssr: false })` — see `editor-loader.tsx`. ProseMirror builds
 * a DOM in its constructor, and `next.config.ts` aliases the whole of TipTap out of the server
 * compilation to keep it out of the Cloudflare Worker, so a static import from anywhere the server
 * renders would fail at build time rather than at runtime. That is the intended behaviour.
 *
 * How it stays in step with the workspace, which is the only genuinely tricky part:
 *
 *   Typing → `onUpdate` → `tipTapToDoc` → `onDocChange`. The workspace stores the new document and
 *   hands it straight back as `doc`, and because it is the same object we just produced, the sync
 *   effect below does nothing. No loop.
 *
 *   Anything else — accept all, apply a regenerated section, restore a version — changes `doc` to
 *   an object the editor has never seen, and the effect replaces the editor's content wholesale.
 *   That resets the cursor, which is correct: none of those are typing, and pretending the caret
 *   survived "keep only mine" would be a lie about a document that just lost half its blocks.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CheckIcon, PlusIcon, SparkIcon, TextIcon, TrashIcon, XIcon } from '@/components/ui/icons';
import { PROVENANCE_LABELS, PROVENANCE_SURFACES } from '@/lib/render/provenance-styles';
import { RenderBlock } from '@/lib/render/blocks';
import { appStrings } from '@/lib/app/strings';
import { cn } from '@/lib/utils/cn';
import type { AiOrigin } from '@/lib/render/provenance-styles';
import type { Block, BlockType, NoteDocument } from '@/lib/ai/schema';

import { BlockEditorDialog } from './block-editors';
import { NoteBlockNode, noteEditorExtensions } from './extensions';
import { blankBlock } from './blank-blocks';
import { docToTipTap } from './from-doc';
import { tipTapToDoc } from './to-doc';

const strings = appStrings.workspace;

export interface EditorViewProps {
  doc: NoteDocument;
  onDocChange: (next: NoteDocument, label: string) => void;
  /** Accept and reject go through the workspace, so bulk and single share one implementation. */
  onAccept: (blockId: string) => void;
  onReject: (blockId: string) => void;
  onRegenerateSection: (sectionId: string) => void;
  onAsk: (selection: string, sectionId: string, afterBlockId: string | null) => void;
  /** The block the review queue is currently pointing at, if any. */
  focusBlockId?: string | null;
}

/**
 * Node-view context.
 *
 * Passed through a module-level ref rather than React context because TipTap constructs node views
 * outside the React tree that renders `EditorContent` — a provider here would not be an ancestor of
 * them. The editor is a singleton on this screen, so a ref is honest about the lifetime rather than
 * pretending at generality.
 */
interface BlockCallbacks {
  accept: (blockId: string) => void;
  reject: (blockId: string) => void;
  edit: (block: Block) => void;
}

const callbacks: { current: BlockCallbacks | null } = { current: null };

export default function EditorView({
  doc,
  onDocChange,
  onAccept,
  onReject,
  onRegenerateSection,
  onAsk,
  focusBlockId = null,
}: EditorViewProps) {
  const [editing, setEditing] = useState<Block | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;
  // `useEditor` builds `onUpdate` once and does not rebuild it when a prop changes, so the callback
  // has to be reached through a ref. `onDocChange` is `apply`, whose identity moves with the
  // document — a captured copy would keep writing edits against a document several keystrokes old.
  const changeRef = useRef(onDocChange);
  changeRef.current = onDocChange;
  // The document the editor's content currently reflects. Identity, not equality: the workspace
  // hands back the very object `onUpdate` produced, and that is the signal for "this change came
  // from in here, do not touch the content".
  const synced = useRef<NoteDocument | null>(null);

  const extensions = useMemo(
    () =>
      noteEditorExtensions().map((extension) =>
        extension.name === 'noteBlock'
          ? NoteBlockNode.extend({
              addNodeView: () => ReactNodeViewRenderer(NoteBlockView),
            })
          : extension,
      ),
    [],
  );

  const editor = useEditor(
    {
      extensions,
      content: docToTipTap(doc),
      // 03 §6's measure and rhythm, so editing looks like the document it edits rather than like a
      // form. `prose-note` is defined in `notes.css` alongside the read view's own styles.
      editorProps: {
        attributes: {
          class: 'lumen-note prose-note max-w-(--measure) focus:outline-none',
          'aria-label': 'Your study guide',
          // Chrome maps a bare `contenteditable` div to `generic`, not to `textbox` — so without
          // these the editor is invisible to a screen reader and to anything else driving the page
          // by role, which is how the e2e suite found it. ProseMirror does not add them itself.
          role: 'textbox',
          'aria-multiline': 'true',
        },
      },
      immediatelyRender: false,
      onUpdate: ({ editor: instance }) => {
        const next = tipTapToDoc(docRef.current, instance.getJSON());
        synced.current = next;
        changeRef.current(next, 'Edited');
      },
    },
    [extensions],
  );

  /* Keeping the editor in step with changes made outside it -------------------- */
  useEffect(() => {
    if (!editor || synced.current === doc) return;
    synced.current = doc;
    // `false` so this does not fire `onUpdate` and bounce straight back out again.
    editor.commands.setContent(docToTipTap(doc), { emitUpdate: false });
  }, [doc, editor]);

  /* The review queue scrolls the editor, not the page ------------------------- */
  useEffect(() => {
    if (!focusBlockId) return;
    const element = window.document.querySelector(`[data-block-id="${CSS.escape(focusBlockId)}"]`);
    element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focusBlockId]);

  callbacks.current = {
    accept: onAccept,
    reject: onReject,
    edit: (block) => setEditing(block),
  };

  const currentSectionId = useCallback((): string => {
    if (!editor) return doc.sections[0]?.id ?? '';
    const { $from } = editor.state.selection;
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const node = $from.node(depth);
      if (node.type.name === 'section') return String(node.attrs.sectionId);
    }
    return doc.sections[0]?.id ?? '';
  }, [doc.sections, editor]);

  const insert = (type: BlockType) => {
    if (!editor) return;
    const block = blankBlock(type);
    editor
      .chain()
      .focus()
      .insertContentAt(editor.state.selection.to, {
        type: 'noteBlock',
        attrs: {
          blockId: null,
          origin: 'student',
          originalText: null,
          blockType: type,
          payload: block,
        },
      })
      .run();
    setEditing(block);
  };

  const ask = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const selection = editor.state.doc.textBetween(from, to, ' ').trim();
    if (!selection) return;
    onAsk(selection, currentSectionId(), blockIdAt(editor));
  };

  /**
   * Whether anything is selected, as React state.
   *
   * TipTap 3's `useEditor` does not re-render on every transaction — deliberately, because a
   * component that did would re-render on each keystroke. So the toolbar has to subscribe to the
   * one thing it actually depends on. Reading `editor.state.selection` during render instead looks
   * right and is stale: "Ask about this" stays disabled however much text you highlight.
   */
  const [hasSelection, setHasSelection] = useState(false);
  useEffect(() => {
    if (!editor) return;
    const sync = () => setHasSelection(!editor.state.selection.empty);
    sync();
    editor.on('selectionUpdate', sync);
    editor.on('transaction', sync);
    return () => {
      editor.off('selectionUpdate', sync);
      editor.off('transaction', sync);
    };
  }, [editor]);

  return (
    <div className="flex flex-col gap-4">
      <EditorToolbar
        canAsk={hasSelection}
        onInsert={insert}
        onAsk={ask}
        onRegenerate={() => onRegenerateSection(currentSectionId())}
      />

      <EditorContent editor={editor} />

      <BlockEditorDialog
        block={editing}
        onClose={() => setEditing(null)}
        onSave={(next) => {
          setEditing(null);
          if (!editor) return;
          applyBlockEdit(editor, next);
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- *
 * Toolbar
 * -------------------------------------------------------------------------- */

const INSERTABLE: { type: BlockType; label: string }[] = [
  { type: 'formula', label: strings.insertEquation },
  { type: 'structure', label: strings.insertStructure },
  { type: 'diagram', label: strings.insertDiagram },
  { type: 'workedExample', label: strings.insertWorkedExample },
  { type: 'callout', label: strings.insertCallout },
  { type: 'table', label: strings.insertTable },
  { type: 'figure', label: strings.insertImage },
];

function EditorToolbar({
  canAsk,
  onInsert,
  onAsk,
  onRegenerate,
}: {
  canAsk: boolean;
  onInsert: (type: BlockType) => void;
  onAsk: () => void;
  onRegenerate: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg-raised px-3 py-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="secondary" icon={<PlusIcon />}>
            {strings.insert}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {INSERTABLE.map((entry) => (
            <DropdownMenuItem key={entry.type} onSelect={() => onInsert(entry.type)}>
              {entry.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button size="sm" variant="ghost" icon={<TextIcon />} onClick={onAsk} disabled={!canAsk}>
        {strings.askTitle}
      </Button>

      <Button size="sm" variant="ghost" icon={<SparkIcon />} onClick={onRegenerate}>
        {strings.regenerateSection}
      </Button>

      {canAsk ? null : (
        <p className="font-sans text-xs text-text-muted">{strings.askSelectFirst}</p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- *
 * The atom node view
 * -------------------------------------------------------------------------- */

/**
 * One non-prose block, drawn by the read renderer, wrapped in the chrome an editor needs.
 *
 * Using `RenderBlock` here rather than an editing-specific rendering is what makes the edit view
 * look like the note. It also means a formula in the editor is typeset by the same KaTeX call as
 * the one in the read view, so "it looked different after I saved" cannot happen.
 */
function NoteBlockView({ node, deleteNode }: NodeViewProps) {
  const payload = node.attrs.payload as Record<string, unknown> | null;
  const origin = String(node.attrs.origin ?? 'student');
  const blockId = node.attrs.blockId as string | null;

  if (!payload) return <NodeViewWrapper />;
  const block = { ...payload, origin, id: blockId ?? undefined } as Block;

  return (
    <NodeViewWrapper
      data-block-id={blockId ?? undefined}
      // `contentEditable={false}` on an atom is what stops the caret entering a node whose
      // contents are not text. Without it a student can put a cursor inside a rendered formula and
      // type characters that go nowhere.
      contentEditable={false}
      className="relative my-2"
    >
      <ProvenanceFrame origin={origin} blockId={blockId}>
        {/* `bare` because the frame above already carries the provenance treatment; letting the
            renderer add its own puts a tinted box inside a tinted box. */}
        <RenderBlock block={block} bare={origin !== 'student'} />
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            icon={<TextIcon />}
            onClick={() => callbacks.current?.edit(block)}
          >
            {strings.editBlock}
          </Button>
          {/* Backspace on an atom deletes it, but nothing on screen says so — and a block a
              student cannot see how to remove is one they work around instead. */}
          <Button size="sm" variant="ghost" icon={<TrashIcon />} onClick={deleteNode}>
            {strings.deleteBlock}
          </Button>
        </div>
      </ProvenanceFrame>
    </NodeViewWrapper>
  );
}

/**
 * The accept/reject strip on an AI block.
 *
 * On the block itself rather than in a side panel, because the decision needs the content in front
 * of it: "was this addition worth keeping" is unanswerable from a list of summaries. Student-origin
 * blocks get no strip at all — there is nothing to decide, and a row of buttons under every
 * paragraph would make the whole document look provisional.
 */
function ProvenanceFrame({
  origin,
  blockId,
  children,
}: {
  origin: string;
  blockId: string | null;
  children: React.ReactNode;
}) {
  if (origin === 'student' || !blockId) return <>{children}</>;
  const ai = origin as AiOrigin;

  return (
    <div className={cn('rounded-r-note py-1 pr-3 pl-4', PROVENANCE_SURFACES[ai]?.calm)}>
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="font-sans text-xs font-medium tracking-wide text-text-muted uppercase">
          {PROVENANCE_LABELS[ai]}
        </span>
        <span className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            icon={<CheckIcon />}
            title={strings.acceptHint}
            onClick={() => callbacks.current?.accept(blockId)}
          >
            {strings.accept}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<XIcon />}
            title={origin === 'ai-added' ? strings.rejectAddedHint : strings.rejectChangedHint}
            onClick={() => callbacks.current?.reject(blockId)}
          >
            {strings.reject}
          </Button>
        </span>
      </div>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- *
 * Helpers that need the live editor
 * -------------------------------------------------------------------------- */

type LiveEditor = NonNullable<ReturnType<typeof useEditor>>;

/** Writes an edited block back into the atom it came from, found by its id. */
function applyBlockEdit(editor: LiveEditor, next: Block) {
  const { id, ...payload } = next;
  let target: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'noteBlock') return;
    // A freshly inserted block has no id yet, and there is exactly one selected node at that
    // moment — the one that was just inserted.
    if (node.attrs.blockId === id || (!id && pos === editor.state.selection.from)) target = pos;
  });

  if (target === null) return;
  editor
    .chain()
    .focus()
    .command(({ tr }) => {
      tr.setNodeAttribute(target as number, 'payload', payload);
      tr.setNodeAttribute(target as number, 'blockType', next.type);
      tr.setNodeAttribute(target as number, 'origin', next.origin);
      return true;
    })
    .run();
}

/** The id of the block the cursor is in, for anchoring an inserted margin note. */
function blockIdAt(editor: LiveEditor): string | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const id = $from.node(depth).attrs.blockId;
    if (typeof id === 'string' && id) return id;
  }
  return null;
}
