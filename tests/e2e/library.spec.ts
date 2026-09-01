import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * The library, in a real browser.
 *
 * The node suites (`pnpm test:rls`, `pnpm test:sync`, `pnpm test:account-delete`) prove what the
 * database does. Nothing there opens IndexedDB, and the v3 upgrade, the object URLs behind the
 * thumbnails and the conflict resolver only exist here — so this file seeds a **v3** database the
 * way phase-05 seeds a v1 one, and drives the screen the way a student would.
 */

interface SeedNote {
  id: string;
  title: string;
  unitId?: string | null;
  updatedAt?: number;
  conflictStatus?: 'unresolved' | null;
  conflictOf?: string | null;
  thumbnailAssetId?: string | null;
}

async function seedLibrary(page: Page, notes: SeedNote[], units: { id: string; name: string }[]) {
  await page.goto('/app/library');
  // The app owns the schema: `getDb()` runs the v1→v3 upgrade on first mount. Opening
  // `indexedDB.open('lumen', 3)` before that would create an empty database with no stores at
  // all, and every seed below would fail on a store that the real upgrade creates. Waiting for
  // the empty state is waiting for `loadLibrary()` to have resolved, which is waiting for v3.
  await expect(page.getByText('Your first lesson will live here')).toBeVisible();
  await page.evaluate(
    async ({ notes, units }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('lumen', 3);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const now = Date.now();
      const tx = db.transaction(['courses', 'units', 'notes', 'assets'], 'readwrite');
      tx.objectStore('courses').put({
        id: 'course-chem',
        subject: 'Chemistry',
        curriculum: 'AP',
        name: 'AP Chemistry',
        packId: null,
        color: 'accent',
        ordinal: 0,
        createdAt: now,
        updatedAt: now,
      });
      units.forEach((unit, ordinal) => {
        tx.objectStore('units').put({
          id: unit.id,
          courseId: 'course-chem',
          name: unit.name,
          ordinal,
          createdAt: now,
          updatedAt: now,
        });
      });
      const base = {
        status: 'ready',
        context: {
          subject: 'Chemistry',
          curriculum: 'AP',
          course: 'AP Chemistry',
          unit: 'Atomic structure',
          topic: null,
          language: 'en',
        },
        options: { mode: 'complete', depth: 'match', visuals: 'auto', voice: 'keep-mine' },
        draftId: 'draft-test',
        source: { kind: 'paste', filenames: [], extractedCharCount: 30, ocrPages: 0 },
        doc: { blocks: [], meta: { charCount: 0, pageCount: 0, sourceFiles: [] } },
        courseId: 'course-chem',
        createdAt: now,
      };
      for (const note of notes) {
        tx.objectStore('notes').put({
          ...base,
          ...note,
          localId: note.id,
          unitId: note.unitId ?? units[0]?.id ?? null,
          updatedAt: note.updatedAt ?? now,
        });
        if (!note.thumbnailAssetId) continue;
        tx.objectStore('assets').put({
          id: note.thumbnailAssetId,
          noteId: note.id,
          sourceId: note.id,
          kind: 'note-thumbnail',
          mime: 'image/svg+xml',
          bytes: new TextEncoder().encode(
            '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#fbfaf6"/></svg>',
          ).buffer,
          width: 800,
          height: 500,
          alt: '',
        });
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { notes, units },
  );
  await page.reload();
}

test('signed-out library stays functional and organises local lessons', async ({ page }) => {
  await seedLibrary(
    page,
    [
      { id: 'note-bonds', title: 'Covalent bonds' },
      { id: 'note-atoms', title: 'Atomic models', updatedAt: Date.now() - 1000 },
    ],
    [{ id: 'unit-atoms', name: 'Atomic structure' }],
  );

  await expect(page.getByRole('heading', { name: 'Your library' })).toBeVisible();
  await expect(page.getByText('Sign in to keep these across devices')).toBeVisible();
  await expect(
    page.getByRole('tree', { name: 'Subjects, courses, units and lessons' }),
  ).toBeVisible();
  await expect(page.getByText('Covalent bonds')).toBeVisible();
  await expect(page.getByText('Atomic models')).toBeVisible();

  const search = page.getByRole('textbox', { name: 'Search notes' });
  await search.fill('covalent');
  await expect(page.getByText('Covalent bonds')).toBeVisible();
  await expect(page.getByText('Atomic models')).toBeHidden();

  // A search that matches nothing offers the way back rather than an empty grid.
  await search.fill('polonium');
  await expect(page.getByText('Nothing matches that search')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByText('Atomic models')).toBeVisible();

  await page.getByRole('checkbox', { name: 'Select Covalent bonds' }).click();
  await page.getByRole('checkbox', { name: 'Select Atomic models' }).click();
  await expect(page.getByText('2 selected')).toBeVisible();
  await page.getByRole('button', { name: 'Combine deck' }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'Those lessons do not have any flashcards yet.',
  );
});

test('a course and a unit can be made from the tree, and a lesson moved into it', async ({
  page,
}) => {
  await seedLibrary(
    page,
    [{ id: 'note-bonds', title: 'Covalent bonds' }],
    [{ id: 'unit-atoms', name: 'Atomic structure' }],
  );

  await page.getByRole('button', { name: 'Add course', exact: true }).click();
  const courseDialog = page.getByRole('dialog');
  await courseDialog.getByRole('textbox').fill('AP Biology');
  await courseDialog.getByRole('button', { name: 'Biology' }).click();
  await courseDialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('treeitem', { name: /AP Biology/ })).toBeVisible();

  // A unit is added under whichever course or unit the tree has selected.
  await page.getByRole('treeitem', { name: /AP Biology/ }).click();
  await page.getByRole('button', { name: 'Add unit', exact: true }).click();
  const unitDialog = page.getByRole('dialog');
  await unitDialog.getByRole('textbox').fill('Cell structure');
  await unitDialog.getByRole('button', { name: 'Save' }).click();
  // A course with no units yet is a leaf, so it is collapsed; the new unit is under it.
  await page.getByRole('treeitem', { name: /AP Biology/ }).click();
  await expect(page.getByRole('treeitem', { name: /Cell structure/ })).toBeVisible();

  // Drag and drop is not reachable by keyboard, so the same move has a dialog.
  await page.getByRole('button', { name: /All notes/ }).click();
  await page.getByRole('checkbox', { name: 'Select Covalent bonds' }).click();
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  const moveDialog = page.getByRole('dialog');
  await moveDialog.getByRole('combobox').click();
  await page.getByRole('option', { name: /Cell structure/ }).click();
  await moveDialog.getByRole('button', { name: 'Move here' }).click();
  await expect(page.getByText('Lessons moved.', { exact: true })).toBeVisible();

  // The card, not the tree row: moving across courses has to carry the course with the unit.
  const card = page.getByRole('link', { name: /Covalent bonds/ });
  await page.getByRole('treeitem', { name: /Cell structure/ }).click();
  await expect(card).toBeVisible();
  await expect(card).toContainText('AP Biology');
  await page.getByRole('treeitem', { name: /AP Chemistry/ }).click();
  await expect(card).toBeHidden();
});

test('a conflicted copy is flagged until the student decides, and the thumbnail renders', async ({
  page,
}) => {
  await seedLibrary(
    page,
    [
      { id: 'note-bonds', title: 'Covalent bonds', thumbnailAssetId: 'thumbnail:note-bonds' },
      {
        id: 'note-bonds-conflict',
        title: 'Covalent bonds (conflicted copy)',
        conflictStatus: 'unresolved',
        conflictOf: 'note-bonds',
      },
    ],
    [{ id: 'unit-atoms', name: 'Atomic structure' }],
  );

  // The saved SVG preview comes back out of IndexedDB as an object URL, not from the network.
  // `alt=""` makes the preview presentational, so it is addressed by its object URL. That URL is
  // the proof: the SVG came out of IndexedDB, not off the network.
  const thumbnail = page.locator('img[src^="blob:"]').first();
  await expect(thumbnail).toBeVisible();
  await expect(thumbnail).toHaveJSProperty('naturalWidth', 800);

  await expect(page.getByText('Two versions need a decision')).toBeVisible();
  await expect(page.getByText('Conflicted copy', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Keep both' }).click();
  await expect(page.getByText('Two versions need a decision')).toBeHidden();
  // Keeping both leaves the other version alone: nothing is deleted behind the student's back.
  await expect(page.getByText('Covalent bonds', { exact: true })).toBeVisible();
  await expect(page.getByText('Covalent bonds (conflicted copy)')).toBeVisible();
});

test('an expired sign-in link says so instead of landing silently signed out', async ({ page }) => {
  await page.goto('/app?auth=failed');
  await expect(page.getByText('That sign-in link did not work')).toBeVisible();
  // Said once: a reload is not a second accusation that their link is broken.
  await page.reload();
  await expect(page.getByText('That sign-in link did not work')).toBeHidden();
});

test('lessons that have never been filed produce one course, not one course each', async ({
  page,
}) => {
  await page.goto('/app/library');
  await expect(page.getByText('Your first lesson will live here')).toBeVisible();

  // Notes as they exist for a student who has only ever been signed out: a course and a unit in
  // the context, and no row for either. The library files them on first sight, and it used to do
  // that in parallel — every note reading the same empty library and creating its own course.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lumen', 3);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const now = Date.now();
    const context = {
      subject: 'Chemistry',
      curriculum: 'AP',
      course: 'AP Chemistry',
      unit: 'Atomic structure',
      topic: null,
      language: 'en',
    };
    const tx = db.transaction(['notes'], 'readwrite');
    for (const [id, title] of [
      ['note-a', 'Moles and molar mass'],
      ['note-b', 'Gas laws'],
      ['note-c', 'Reaction rates'],
    ]) {
      tx.objectStore('notes').put({
        id,
        localId: id,
        title,
        status: 'ready',
        createdAt: now,
        updatedAt: now,
        context,
        options: { mode: 'complete', depth: 'match', visuals: 'auto', voice: 'keep-mine' },
        draftId: `draft-${id}`,
        source: { kind: 'paste', filenames: [], extractedCharCount: 30, ocrPages: 0 },
        doc: { blocks: [], meta: { charCount: 0, pageCount: 0, sourceFiles: [] } },
      });
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();

  await expect(page.getByRole('treeitem', { name: /AP Chemistry/ })).toHaveCount(1);
  await expect(page.getByRole('button', { name: /All notes/ })).toContainText('3');
  await page.getByRole('treeitem', { name: /AP Chemistry/ }).click();
  await expect(page.getByRole('treeitem', { name: /Atomic structure/ })).toHaveCount(1);
});
