'use client';

/**
 * The sticky action bar (phase-05 §1, 01-PRODUCT.md §2 step 5).
 *
 * Read · Edit · Study on the left, everything that acts on the note on the right, and the reading
 * mode under them when Read is showing. It is sticky because the actions a student wants after
 * reading half a study guide are the same ones they wanted at the top, and a document this long
 * otherwise makes "Edit" a scroll.
 *
 * The save/export/share buttons are honest stubs. Phase-06 brings accounts and phase-07 brings
 * export and sharing; until then each says what it will do and why it cannot yet, because a
 * disabled button with no explanation is the one thing 01 §6 is most insistent about.
 */
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  ArrowUpIcon,
  BookIcon,
  CircleDotIcon,
  DownloadIcon,
  ExternalLinkIcon,
  SparkIcon,
} from '@/components/ui/icons';
import { ReadingModeToggle } from '@/lib/render/reading-mode-toggle';
import { ReadingModeProvider } from '@/lib/render/reading-mode';
import { appStrings } from '@/lib/app/strings';
import { cn } from '@/lib/utils/cn';
import type { ReadingMode } from '@/lib/render/reading-mode';

export type WorkspaceMode = 'read' | 'edit' | 'study';

const strings = appStrings.workspace;

export interface ActionBarProps {
  mode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
  readingMode: ReadingMode;
  onReadingModeChange: (mode: ReadingMode) => void;
  /** False when the document has almost nothing of the student's own left to show. */
  canShowOriginal: boolean;
  saving: boolean;
  edited: boolean;
  canUndo: boolean;
  onUndo: () => void;
  onRegenerate: () => void;
  onHistory: () => void;
  /** The stubs (phase-06 / phase-07) explain themselves through this. */
  onUnavailable: (message: string) => void;
}

export function ActionBar({
  mode,
  onModeChange,
  readingMode,
  onReadingModeChange,
  canShowOriginal,
  saving,
  edited,
  canUndo,
  onUndo,
  onRegenerate,
  onHistory,
  onUnavailable,
}: ActionBarProps) {
  return (
    <div
      className={cn(
        'sticky top-0 z-30 -mx-5 mb-6 border-b border-border bg-bg/90 px-5 py-3',
        'backdrop-blur supports-[backdrop-filter]:bg-bg/75',
      )}
    >
      <div className="mx-auto flex w-full max-w-(--note-shell) flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            label="View"
            size="sm"
            value={mode}
            onValueChange={onModeChange}
            options={[
              { value: 'read', label: strings.read },
              { value: 'edit', label: strings.edit },
              { value: 'study', label: strings.study },
            ]}
          />

          <div className="flex flex-wrap items-center gap-2">
            <SaveState saving={saving} edited={edited} />

            {/* Undo for the operations that are not typing. TipTap has its own history for prose,
                which is the right granularity there; this one exists because "accept all" and
                "keep only mine" are single presses that change the whole document, and a student
                who pressed one by mistake should not have to go through version history. */}
            {canUndo ? (
              <Button size="sm" variant="ghost" icon={<ArrowUpIcon />} onClick={onUndo}>
                {strings.undo}
              </Button>
            ) : null}

            <Button
              size="sm"
              variant="ghost"
              icon={<BookIcon />}
              onClick={() => onUnavailable(strings.saveToLibraryHint)}
            >
              {strings.saveToLibrary}
            </Button>

            <Button
              size="sm"
              variant="ghost"
              icon={<DownloadIcon />}
              onClick={() => onUnavailable(strings.exportSoon)}
            >
              {strings.exportCta}
            </Button>

            <Button
              size="sm"
              variant="ghost"
              icon={<ExternalLinkIcon />}
              onClick={() => onUnavailable(strings.shareSoon)}
            >
              {strings.shareCta}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="secondary" icon={<SparkIcon />}>
                  {strings.regenerate}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{strings.regenerate}</DropdownMenuLabel>
                <DropdownMenuItem onSelect={onRegenerate}>
                  {strings.regenerateSection}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onHistory}>
                  <CircleDotIcon aria-hidden="true" />
                  {strings.history}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {mode === 'read' ? (
          // The toggle is the renderer's component, driven from here. Wrapping it in a controlled
          // provider is what lets one control sit outside the document it reshapes.
          <ReadingModeProvider mode={readingMode} onModeChange={onReadingModeChange}>
            <ReadingModeToggle
              size="sm"
              {...(canShowOriginal ? {} : { disabled: ['my-original' as ReadingMode] })}
            />
          </ReadingModeProvider>
        ) : null}
      </div>
    </div>
  );
}

/**
 * "Saving…" then "Saved on this device".
 *
 * Present from the first edit and never afterwards absent, because the question it answers — is my
 * work safe? — is one a student asks continuously in an editor with no Save button, and an
 * indicator that appears only while writing answers it exactly when they are not asking.
 */
function SaveState({ saving, edited }: { saving: boolean; edited: boolean }) {
  if (!edited) return null;
  return (
    <p aria-live="polite" className="font-sans text-xs text-text-muted">
      {saving ? strings.saving : strings.saved}
    </p>
  );
}
