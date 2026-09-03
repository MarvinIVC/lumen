'use client';

/**
 * "Save to library", doing what it says (phase-06's library, phase-07's wiring).
 *
 * It was a stub whose copy was false in two ways: it implied the library needs an account, and it
 * implied the note was not saved. Neither is true. Phase-06's whole design is that signing out
 * stays fully functional and local, and a note is filed into its course automatically — on the
 * sign-in merge, and every time the library screen loads.
 *
 * So the button files it *now*, which is the one moment that automatic filing does not cover: just
 * after generating, before the student has been anywhere near the library. It is idempotent —
 * `placeNoteFromContext` returns early once a note has a course and a unit — and it works signed
 * out, because the library does.
 */
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { BookIcon } from '@/components/ui/icons';
import { useToast } from '@/components/ui/toast';
import { appStrings } from '@/lib/app/strings';
import { APP_LIBRARY } from '@/lib/app/routes';
import { loadLibrary, placeNoteFromContext } from '@/lib/store/library';
import type { LocalNote } from '@/lib/store/types';

const strings = appStrings.workspace;

export function SaveToLibrary({ note }: { note: LocalNote }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      const placed = await placeNoteFromContext(note);
      const library = await loadLibrary();
      const course = library.courses.find((row) => row.id === placed.courseId);
      const unit = library.units.find((row) => row.id === placed.unitId);

      toast({
        title: strings.savedToLibrary,
        description: course
          ? strings.savedUnder(course.name, unit?.name ?? '')
          : strings.savedPlain,
        tone: 'success',
        action: {
          label: strings.viewLibrary,
          onClick: () => {
            window.location.href = APP_LIBRARY;
          },
        },
      });
    } catch {
      toast({ title: strings.saveFailed, description: strings.saveFailedBody, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      icon={<BookIcon />}
      loading={busy}
      onClick={() => void save()}
    >
      {strings.saveToLibrary}
    </Button>
  );
}
