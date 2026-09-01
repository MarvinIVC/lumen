'use client';

/**
 * The restore list (phase-05 §13).
 *
 * Deliberately a list and a button, not a diff viewer. What a student wants from history is "put it
 * back to before I did that", and the two things they need to pick the right entry are when it was
 * and why it was taken — "Generated", "Section rewritten", "While you were editing". A visual diff
 * between two versions of a typeset document is a large feature that answers a question they were
 * not asking.
 */
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { CircleDotIcon } from '@/components/ui/icons';
import { appStrings } from '@/lib/app/strings';
import type { NoteVersion } from '@/lib/store/types';

const strings = appStrings.workspace;

export function VersionHistory({
  open,
  onOpenChange,
  versions,
  onRestore,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versions: NoteVersion[];
  onRestore: (versionId: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={strings.historyTitle}
        description="Every version of this note that is saved on this device."
        size="md"
      >
        {versions.length === 0 ? (
          <EmptyState
            icon={<CircleDotIcon />}
            title={strings.historyTitle}
            description={strings.historyEmpty}
          />
        ) : (
          <ol className="flex flex-col gap-1">
            {versions.map((version, index) => (
              <li
                key={version.id}
                className="flex items-center justify-between gap-4 rounded-md px-3 py-2.5 hover:bg-bg-sunken"
              >
                <div className="min-w-0">
                  <p className="font-sans text-sm text-text">
                    {strings.historyReason[version.reason] ?? version.label}
                  </p>
                  <p className="font-sans text-xs text-text-muted">
                    <time dateTime={new Date(version.createdAt).toISOString()}>
                      {formatWhen(version.createdAt)}
                    </time>
                  </p>
                </div>
                {/* The newest entry is what is on screen. Offering "restore" for it would be a
                    button that does nothing, which is worse than no button. */}
                {index === 0 ? (
                  <span className="shrink-0 font-sans text-xs text-text-muted">
                    {strings.historyCurrent}
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      onRestore(version.id);
                      onOpenChange(false);
                    }}
                  >
                    {strings.historyRestore}
                  </Button>
                )}
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** "Today at 14:02" for the ones a student is likely to want, a date for the rest. */
function formatWhen(at: number): string {
  const date = new Date(at);
  const time = date.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  return sameDay
    ? `Today at ${time}`
    : `${date.toLocaleDateString('en', { day: 'numeric', month: 'short' })} at ${time}`;
}
