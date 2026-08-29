'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDownIcon, DownloadIcon } from '@/components/ui/icons';

export interface ExportOptions {
  includeStudyTools: boolean;
  includeProvenance: boolean;
}

export interface ExportMenuProps {
  options: ExportOptions;
  onOptionsChange: (options: ExportOptions) => void;
  onExport: (format: 'pdf' | 'docx' | 'markdown' | 'anki') => void;
}

/**
 * The export menu (06 §2). Every format is generated in the browser, which is worth saying in the
 * menu itself — it is the difference between "we send your notes somewhere" and "we don't", and
 * that is the kind of claim people only believe when it is stated where the action is.
 *
 * The two toggles are the ones 06 §2 calls out: notes only vs notes + study tools, and whether to
 * keep the AI provenance marks in the exported copy.
 */
export function ExportMenu({ options, onOptionsChange, onExport }: ExportMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button icon={<DownloadIcon />} trailing={<ChevronDownIcon />}>
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-64">
        <DropdownMenuLabel>Download</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onExport('pdf')}>
          PDF — looks like a handout
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onExport('docx')}>
          Word — editable, close enough
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onExport('markdown')}>
          Markdown — Obsidian-friendly
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onExport('anki')}>
          Anki — your flashcards as a deck
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Include</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={options.includeStudyTools}
          onCheckedChange={(checked) =>
            onOptionsChange({ ...options, includeStudyTools: checked === true })
          }
        >
          Flashcards and quiz
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={options.includeProvenance}
          onCheckedChange={(checked) =>
            onOptionsChange({ ...options, includeProvenance: checked === true })
          }
        >
          Marks showing what we changed
        </DropdownMenuCheckboxItem>

        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-xs leading-snug text-text-muted">
          Everything is made in your browser. Nothing is uploaded to export it.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
