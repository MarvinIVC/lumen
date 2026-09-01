'use client';

/**
 * The focused editor for one non-prose block (phase-05 §8).
 *
 * A formula is not text you type into. It is a LaTeX string, a "use this when" line and a list of
 * symbols with units — and the rubric requires all three, so an editor that let a student change
 * the equation without touching the units would produce blocks the validator rejects. Every block
 * type gets the two or three fields it actually has, described by `FIELDS`, and the dialog is one
 * component rather than ten.
 *
 * The live preview is the whole right-hand side and it is not a mock: it is `RenderBlock`, the same
 * component the read view uses, drawing the draft block as you type. That is what makes "LaTeX
 * field with live KaTeX preview", "SMILES with live structure" and "Mermaid with live diagram" one
 * feature instead of three — KaTeX, smiles-drawer and Mermaid are already wired into those
 * renderers behind their dynamic imports, and they already fail softly on input that does not parse
 * yet, which is the normal state of a field someone is halfway through typing.
 */
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RenderBlock } from '@/lib/render/blocks';
import { Select, SelectItem } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { appStrings } from '@/lib/app/strings';
import type { Block, BlockType } from '@/lib/ai/schema';

const strings = appStrings.workspace;

/* -------------------------------------------------------------------------- *
 * The field vocabulary
 * -------------------------------------------------------------------------- */

interface TextField {
  kind: 'text' | 'textarea';
  key: string;
  label: string;
  hint?: string;
  rows?: number;
}

interface ChoiceField {
  kind: 'choice';
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

/**
 * A repeating structure, edited as lines.
 *
 * `formula.where`, `table.rows` and `workedExample.steps` are all short lists of short records, and
 * a proper repeater UI for each is a lot of chrome around three text boxes. One line per entry with
 * a documented separator is faster to use and — the part that matters — faster to *scan*, which is
 * what someone fixing a units column is doing.
 */
interface LinesField {
  kind: 'lines';
  key: string;
  label: string;
  hint: string;
  rows?: number;
  encode: (value: unknown) => string;
  decode: (text: string) => unknown;
}

type FieldSpec = TextField | ChoiceField | LinesField;

const pipeRecord = <T extends Record<string, string>>(keys: (keyof T)[]) => ({
  encode: (value: unknown) =>
    Array.isArray(value)
      ? value
          .map((entry) => keys.map((key) => String((entry as T)[key] ?? '')).join(' | '))
          .join('\n')
      : '',
  decode: (text: string) =>
    text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split('|').map((part) => part.trim());
        return Object.fromEntries(keys.map((key, index) => [key, parts[index] ?? ''])) as T;
      }),
});

const stringList = {
  encode: (value: unknown) => (Array.isArray(value) ? value.join('\n') : ''),
  decode: (text: string) =>
    text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
};

const CAPTION_FIELDS: FieldSpec[] = [
  { kind: 'text', key: 'caption', label: 'Caption' },
  {
    kind: 'text',
    key: 'alt',
    label: 'Alt text',
    // 01 §7 makes this a requirement rather than an extra, and the validator enforces it on
    // generated blocks. A hand-inserted one has to meet the same bar.
    hint: 'Describe it for someone who cannot see it. Required.',
  },
];

const FIELDS: Partial<Record<BlockType, FieldSpec[]>> = {
  formula: [
    { kind: 'textarea', key: 'latex', label: strings.latexLabel, hint: strings.latexHint, rows: 3 },
    { kind: 'text', key: 'useWhen', label: 'Use this when…' },
    {
      kind: 'lines',
      key: 'where',
      label: 'Where',
      hint: 'One symbol per line: symbol | meaning | units. Every symbol needs units — "dimensionless" counts.',
      rows: 4,
      ...pipeRecord<{ symbol: string; meaning: string; units: string }>([
        'symbol',
        'meaning',
        'units',
      ]),
    },
    { kind: 'text', key: 'number', label: 'Number', hint: 'Optional, e.g. 1.2.' },
  ],
  definition: [
    { kind: 'text', key: 'term', label: 'Term' },
    { kind: 'textarea', key: 'definition', label: 'Definition', rows: 4 },
  ],
  structure: [
    {
      kind: 'textarea',
      key: 'smiles',
      label: strings.smilesLabel,
      hint: strings.smilesHint,
      rows: 2,
    },
    ...CAPTION_FIELDS,
  ],
  diagram: [
    {
      kind: 'textarea',
      key: 'source',
      label: strings.mermaidLabel,
      hint: strings.mermaidHint,
      rows: 8,
    },
    ...CAPTION_FIELDS,
  ],
  callout: [
    {
      kind: 'choice',
      key: 'kind',
      label: 'Kind',
      options: [
        { value: 'definition', label: 'Definition' },
        { value: 'tip', label: 'Tip' },
        { value: 'warning', label: 'Warning' },
        { value: 'example', label: 'Example' },
      ],
    },
    { kind: 'text', key: 'title', label: 'Title', hint: 'Optional.' },
    { kind: 'textarea', key: 'text', label: 'Text', rows: 4 },
  ],
  misconception: [
    { kind: 'textarea', key: 'wrong', label: 'The wrong idea', rows: 2 },
    { kind: 'textarea', key: 'right', label: 'What is actually true', rows: 3 },
  ],
  workedExample: [
    { kind: 'textarea', key: 'problem', label: 'Problem', rows: 3 },
    {
      kind: 'lines',
      key: 'steps',
      label: 'Solution steps',
      hint: 'One step per line: what you do | the maths in LaTeX (optional).',
      rows: 6,
      ...pipeRecord<{ text: string; latex: string }>(['text', 'latex']),
    },
    {
      kind: 'text',
      key: 'answer',
      label: 'Answer',
      hint: 'With units and the right significant figures.',
    },
    { kind: 'text', key: 'commonMistake', label: 'Common mistake' },
  ],
  table: [
    { kind: 'text', key: 'caption', label: 'Caption' },
    {
      kind: 'lines',
      key: 'columns',
      label: 'Columns',
      hint: 'One per line: heading | numeric. Write "numeric" in the second part to right-align it.',
      rows: 4,
      encode: (value: unknown) =>
        Array.isArray(value)
          ? value
              .map((column) => {
                const entry = column as { header?: string; numeric?: boolean };
                return `${entry.header ?? ''}${entry.numeric ? ' | numeric' : ''}`;
              })
              .join('\n')
          : '',
      decode: (text: string) =>
        text
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [header, flag] = line.split('|').map((part) => part.trim());
            return {
              header: header ?? '',
              ...(flag?.toLowerCase() === 'numeric' ? { numeric: true } : {}),
            };
          }),
    },
    {
      kind: 'lines',
      key: 'rows',
      label: 'Rows',
      hint: 'One row per line, cells separated by |.',
      rows: 6,
      encode: (value: unknown) =>
        Array.isArray(value) ? value.map((row) => (row as string[]).join(' | ')).join('\n') : '',
      decode: (text: string) =>
        text
          .split('\n')
          .filter((line) => line.trim())
          .map((line) => line.split('|').map((cell) => cell.trim())),
    },
  ],
  marginNote: [
    {
      kind: 'choice',
      key: 'kind',
      label: 'Kind',
      options: [
        { value: 'connection', label: 'Connection' },
        { value: 'mnemonic', label: 'Mnemonic' },
        { value: 'exam-tip', label: 'Exam tip' },
        { value: 'why-it-matters', label: 'Why it matters' },
      ],
    },
    { kind: 'textarea', key: 'text', label: 'Note', rows: 4 },
  ],
  figure: CAPTION_FIELDS,
  list: [
    { kind: 'lines', key: 'items', label: 'Items', hint: 'One per line.', rows: 6, ...stringList },
  ],
};

export function fieldsFor(type: BlockType): FieldSpec[] {
  return FIELDS[type] ?? [];
}

/* -------------------------------------------------------------------------- *
 * The dialog
 * -------------------------------------------------------------------------- */

export function BlockEditorDialog({
  block,
  onSave,
  onClose,
}: {
  block: Block | null;
  onSave: (next: Block) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Block | null>(block);

  // A new target means a new draft, and the target is compared by identity rather than by id.
  //
  // Keying on `block.id` was wrong in the one case that matters most: a block inserted from the
  // menu has no id yet, so its key was `null` — the same key the dialog was mounted with while
  // closed — and the draft was never seeded. Inserting anything opened an empty dialog. Two
  // different blocks are always two different objects; two ids can both be undefined.
  const [seen, setSeen] = useState(block);
  if (block !== seen) {
    setSeen(block);
    setDraft(block);
  }

  const fields = useMemo(() => (draft ? fieldsFor(draft.type) : []), [draft]);

  const set = (fieldKey: string, value: unknown) => {
    setDraft((current) => (current ? ({ ...current, [fieldKey]: value } as Block) : current));
  };

  return (
    <Dialog open={block !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        title={strings.editBlock}
        description="The preview updates as you type."
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              {strings.cancel}
            </Button>
            <Button onClick={() => draft && onSave(draft)}>{strings.saveBlock}</Button>
          </div>
        }
      >
        {draft ? (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-4">
              {fields.map((field) => (
                <BlockField
                  key={field.key}
                  field={field}
                  value={(draft as unknown as Record<string, unknown>)[field.key]}
                  onChange={(value) => set(field.key, value)}
                />
              ))}
            </div>

            <div className="min-w-0 rounded-note border border-border bg-bg-sunken p-4">
              <p className="mb-3 font-sans text-xs font-medium tracking-wide text-text-muted uppercase">
                Preview
              </p>
              {/* The real renderer. KaTeX, Mermaid and smiles-drawer all degrade to a muted chip on
                  input they cannot parse, which is exactly right for a field being typed into. */}
              <RenderBlock block={draft} />
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function BlockField({
  field,
  value,
  onChange,
}: {
  field: FieldSpec;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (field.kind === 'choice') {
    return (
      <Field label={field.label}>
        <Select value={typeof value === 'string' ? value : ''} onValueChange={onChange}>
          {field.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </Select>
      </Field>
    );
  }

  if (field.kind === 'lines') {
    return (
      <Field label={field.label} hint={field.hint}>
        <Textarea
          rows={field.rows ?? 4}
          defaultValue={field.encode(value)}
          className="font-mono text-sm"
          onChange={(event) => onChange(field.decode(event.target.value))}
        />
      </Field>
    );
  }

  const text = typeof value === 'string' ? value : '';
  return (
    <Field label={field.label} {...(field.hint ? { hint: field.hint } : {})}>
      {field.kind === 'textarea' ? (
        <Textarea
          rows={field.rows ?? 3}
          value={text}
          className="font-mono text-sm"
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input value={text} onChange={(event) => onChange(event.target.value)} />
      )}
    </Field>
  );
}
