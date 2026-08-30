import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Phase-03's definition of done, as a suite.
 *
 * Everything ingestion does happens in the browser — mammoth, pdf.js, canvas, IndexedDB — so
 * there is no unit-testable seam for most of it. These are the checks that actually prove the
 * feature: the real fixture goes in as `.txt` and as `.docx` and comes out recognisable, a
 * scanned PDF is flagged rather than silently emptied, detection fills the context card, and a
 * reload loses nothing.
 */
// Playwright loads specs as CommonJS here, so `import.meta` is not available; `process.cwd()` is
// the repository root under `playwright.config.ts`.
const FIXTURES = resolve(process.cwd(), 'fixtures');
const RAW_MD = readFileSync(resolve(FIXTURES, 'ap-chem-u1-raw.md'), 'utf8');

/**
 * Opens `/app/new` and waits for the client to have arrived.
 *
 * Everything on these screens is behaviour, and all of the markup is server-rendered — so the drop
 * zone, the paste box and the button are all on screen and inert for a moment before React
 * attaches. Under `next dev` with nine workers competing for the compiler that moment is long
 * enough to lose a `fill()` to a component that is not listening yet, and the symptom is a paste
 * that silently never arrives.
 */
async function openNew(page: Page) {
  await page.goto('/app/new');
  await page.waitForLoadState('networkidle');
}

/** The dropzone's input is `sr-only`, so it is set directly rather than clicked through. */
async function upload(page: Page, files: string[]) {
  await page.locator('input[type="file"]').first().setInputFiles(files);
}

async function waitForRead(page: Page) {
  await expect(page.getByText(/^Read /)).toBeVisible({ timeout: 30_000 });
}

test.describe('ingestion', () => {
  test('reads the real fixture as .txt and routes to review', async ({ page }) => {
    await openNew(page);

    await upload(page, [resolve(FIXTURES, 'ap-chem-u1-raw.md')]);
    await waitForRead(page);

    await page.getByRole('button', { name: 'Review what we found' }).click();
    await expect(page).toHaveURL(/\/app\/review\?d=/);

    // Structure survived: the fixture's own headings are blocks, not one wall of prose.
    await expect(page.getByRole('textbox', { name: /Text of the block/ }).first()).toHaveValue(
      /# AP Chem Unit 1/,
    );
    await expect(page.getByText(/blocks$/)).toBeVisible();
  });

  test('reads the .docx of the same notes', async ({ page }) => {
    await openNew(page);

    await upload(page, [resolve(FIXTURES, 'ap-chem-u1-raw.docx')]);
    await waitForRead(page);
    await page.getByRole('button', { name: 'Review what we found' }).click();

    const editor = page.getByRole('textbox', { name: /Text of the block/ });
    await expect(editor.first()).toBeVisible();

    const blocks = await editor.evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLTextAreaElement).value),
    );
    const joined = blocks.join('\n');

    // Word's own structure came through: the heading is a heading and the bullets are a list.
    expect(joined).toContain('# AP Chem Unit 1');
    expect(blocks.some((block) => block.startsWith('- '))).toBe(true);
    // The mercury worked example is the fixture's signature line; if the docx path dropped
    // content, it is the first thing to go.
    expect(joined).toContain('mercury');
  });

  test('detection pre-fills the context card from the fixture', async ({ page }) => {
    await openNew(page);
    await upload(page, [resolve(FIXTURES, 'ap-chem-u1-raw.md')]);
    await waitForRead(page);
    await page.getByRole('button', { name: 'Review what we found' }).click();

    await expect(page.getByRole('combobox', { name: 'Subject' })).toHaveValue('Chemistry');
    await expect(page.getByRole('combobox', { name: 'Course' })).toHaveValue('AP Chemistry');
    await expect(page.getByLabel('Unit or topic')).toHaveValue(/Unit 1/);
    await expect(page.getByRole('combobox', { name: 'Curriculum' })).toContainText('AP');

    // Every field is overridable — the whole point of the screen.
    await page.getByLabel('Unit or topic').fill('Unit 2 — Molecular Structure');
    await expect(page.getByLabel('Unit or topic')).toHaveValue('Unit 2 — Molecular Structure');
    await expect(page.getByText('Set by you')).toBeVisible();
  });

  test('a scanned PDF is flagged for OCR with a page preview', async ({ page }) => {
    await openNew(page);
    await upload(page, [resolve(FIXTURES, 'scanned-worksheet.pdf')]);
    await waitForRead(page);

    await expect(page.getByText(/needing OCR/)).toBeVisible();
    await page.getByRole('button', { name: 'Review what we found' }).click();

    await expect(page.getByText('No text layer').first()).toBeVisible();
    await expect(page.getByRole('img', { name: /Scanned page/ }).first()).toBeVisible();

    // The OCR button exists and is honest about not working yet (phase-04 owns the function).
    const ocr = page.getByRole('button', { name: /Run OCR/ }).first();
    await expect(ocr).toBeVisible();
    await expect(ocr).toBeDisabled();
    await expect(page.getByText(/coming soon/).first()).toBeVisible();
  });

  test('multiple files merge into one reviewable lesson', async ({ page }) => {
    await openNew(page);
    await upload(page, [
      resolve(FIXTURES, 'ap-chem-u1-raw.md'),
      resolve(FIXTURES, 'scanned-worksheet.pdf'),
    ]);
    await waitForRead(page);
    await page.getByRole('button', { name: 'Review what we found' }).click();

    await expect(page.getByText('2 files, treated as one lesson')).toBeVisible();
    await expect(page.getByText('ap-chem-u1-raw.md')).toBeVisible();
    await expect(page.getByText(/scanned-worksheet\.pdf · p1/)).toBeVisible();
  });

  test('splitting a lesson keeps the second half whole, images included', async ({ page }) => {
    await openNew(page);
    await upload(page, [
      resolve(FIXTURES, 'ap-chem-u1-raw.md'),
      resolve(FIXTURES, 'scanned-worksheet.pdf'),
    ]);
    await waitForRead(page);
    await page.getByRole('button', { name: 'Review what we found' }).click();

    // `toHaveCount` retries; `count()` does not, and the thumbnails arrive on an effect that has
    // to read them back out of IndexedDB first.
    await expect(page.getByRole('img', { name: /Scanned page/ })).toHaveCount(2);
    const blocksBefore = await page.getByRole('textbox', { name: /Text of the block/ }).count();

    // The marker above the PDF's first page is where the two sources meet.
    await page.getByRole('button', { name: 'Split into two lessons here' }).first().click();
    // The toast is also mirrored into a live region for screen readers, so both would match.
    await expect(page.getByText('Split. The second half is waiting').first()).toBeVisible();

    // This half kept the notes and lost the scans.
    await expect(page.getByRole('textbox', { name: /Text of the block/ })).toHaveCount(
      blocksBefore,
    );
    await expect(page.getByRole('img', { name: /Scanned page/ })).toHaveCount(0);

    // The other half is on the workspace, and its pages still have their pictures — the assets
    // were filed under the draft it was split from, so they have to be copied across.
    await page.goto('/app');
    await expect(page.getByRole('link', { name: 'Continue' })).toHaveCount(2);

    // Picked by title rather than by position: the list is newest-first and the *head* draft was
    // the one written last. The tail is all scanned pages and no prose, so it has no title to
    // take — which is itself the honest answer for a lesson that is nothing but photographs.
    await page
      .locator('li')
      .filter({ hasText: 'Untitled notes' })
      .getByRole('link', { name: 'Continue' })
      .click();

    await expect(page.getByText('No text layer').first()).toBeVisible();
    await expect(page.getByRole('img', { name: /Scanned page/ })).toHaveCount(2);
  });

  test('a refresh on review loses nothing, including an edit', async ({ page }) => {
    await openNew(page);
    await upload(page, [resolve(FIXTURES, 'ap-chem-u1-raw.md')]);
    await waitForRead(page);
    await page.getByRole('button', { name: 'Review what we found' }).click();

    const first = page.getByRole('textbox', { name: /Text of the block/ }).first();
    await first.fill('# Edited before the refresh');
    await page.getByLabel('Unit or topic').fill('Unit 9 — Survives a reload');
    // The store debounces its write; give it more than the 400 ms delay.
    await page.waitForTimeout(900);

    await page.reload();

    await expect(page.getByRole('textbox', { name: /Text of the block/ }).first()).toHaveValue(
      '# Edited before the refresh',
    );
    await expect(page.getByLabel('Unit or topic')).toHaveValue('Unit 9 — Survives a reload');
  });

  test('the draft is in IndexedDB and appears on the workspace', async ({ page }) => {
    await openNew(page);
    await upload(page, [resolve(FIXTURES, 'ap-chem-u1-raw.md')]);
    await waitForRead(page);
    await page.getByRole('button', { name: 'Review what we found' }).click();
    await page.waitForTimeout(900);

    const stored = await page.evaluate(async () => {
      const request = indexedDB.open('lumen');
      const db: IDBDatabase = await new Promise((resolveDb, rejectDb) => {
        request.onsuccess = () => resolveDb(request.result);
        request.onerror = () => rejectDb(request.error);
      });
      const rows: unknown[] = await new Promise((resolveRows) => {
        const all = db.transaction('drafts').objectStore('drafts').getAll();
        all.onsuccess = () => resolveRows(all.result);
      });
      db.close();
      return rows.length;
    });
    expect(stored).toBeGreaterThan(0);

    await page.goto('/app');
    await expect(page.getByRole('heading', { name: 'Pick up where you left off' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Continue' }).first()).toBeVisible();
  });

  test('pasted notes become a lesson without a file', async ({ page }) => {
    await openNew(page);

    await page.getByLabel('Or paste your notes').fill(RAW_MD.slice(0, 1200));
    await page.getByRole('button', { name: 'Add pasted notes' }).click();
    await waitForRead(page);

    await page.getByRole('button', { name: 'Review what we found' }).click();
    await expect(page.getByText('Pasted notes').first()).toBeVisible();
  });

  test('an unsupported file is refused with something to do next', async ({ page }) => {
    await openNew(page);
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({
        name: 'lecture.pptx',
        mimeType: 'application/octet-stream',
        buffer: Buffer.from('x'),
      });

    await expect(page.getByText(/We can't read \.pptx/)).toBeVisible();
    await expect(page.getByText(/paste the text in below/)).toBeVisible();
  });

  test('creating the study guide lands on the note in its draft state', async ({ page }) => {
    await openNew(page);
    await upload(page, [resolve(FIXTURES, 'ap-chem-u1-raw.md')]);
    await waitForRead(page);
    await page.getByRole('button', { name: 'Review what we found' }).click();

    await page.getByRole('button', { name: 'Create study guide' }).click();
    await expect(page).toHaveURL(/\/app\/note\//);
    await expect(page.getByText('Ready to generate').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to review' })).toBeVisible();
  });
});

/**
 * The input caps (02-ARCHITECTURE.md §7 layer 3) and the two states around them: refused before
 * anything is read, and accepted but downscaled.
 */
test.describe('caps', () => {
  test('a 30 MB file is refused before it is read', async ({ page }) => {
    await openNew(page);

    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({
        name: 'whole-term.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.alloc(30 * 1024 * 1024),
      });

    await expect(page.getByText(/whole-term\.pdf is 30\.0 MB/)).toBeVisible();
    await expect(page.getByText(/The limit is 25\.0 MB per lesson/)).toBeVisible();
    // Refused, not parsed: nothing reached the draft.
    await expect(page.getByRole('button', { name: 'Review what we found' })).toBeDisabled();
  });

  test('a 5 MB photo is downscaled to the 2000px cap', async ({ page }) => {
    await openNew(page);

    // 4000 × 3000 of random 3px blocks — about 5 MB of PNG, and drawn in the page so a
    // multi-megabyte binary does not have to be committed to the repository. Random rather than
    // patterned: a gradient compresses to a few kilobytes and would test nothing.
    const png = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 4000;
      canvas.height = 3000;
      const context = canvas.getContext('2d')!;
      for (let y = 0; y < canvas.height; y += 3) {
        for (let x = 0; x < canvas.width; x += 3) {
          const [r, g, b] = crypto.getRandomValues(new Uint8Array(3));
          context.fillStyle = `rgb(${r},${g},${b})`;
          context.fillRect(x, y, 3, 3);
        }
      }
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((result) => resolve(result!), 'image/png'),
      );
      return [...new Uint8Array(await blob.arrayBuffer())];
    });
    expect(png.length).toBeGreaterThan(4 * 1024 * 1024);

    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({
        name: 'whiteboard.png',
        mimeType: 'image/png',
        buffer: Buffer.from(png),
      });
    await waitForRead(page);

    const stored = await page.evaluate(async () => {
      const request = indexedDB.open('lumen');
      const db: IDBDatabase = await new Promise((resolveDb) => {
        request.onsuccess = () => resolveDb(request.result);
      });
      const rows: { width: number; height: number; bytes: ArrayBuffer }[] = await new Promise(
        (done) => {
          const all = db.transaction('assets').objectStore('assets').getAll();
          all.onsuccess = () => done(all.result);
        },
      );
      db.close();
      return rows.map((row) => ({
        width: row.width,
        height: row.height,
        bytes: row.bytes.byteLength,
      }));
    });

    expect(stored).toHaveLength(1);
    expect(stored[0]!.width).toBe(2000);
    expect(stored[0]!.height).toBe(1500);
    // Smaller than the original, on every engine. Safari has no WebP encoder and silently returns
    // PNG when asked for one, which made the downscale produce a *larger* file than it was given.
    expect(stored[0]!.bytes).toBeLessThan(png.length);
  });
});

/**
 * "Works fully offline for local files" (phase-03 DoD), and the honest boundary of that claim.
 *
 * Parsing, detection, the quality gate, the draft store and every edit are local, and this proves
 * it with the network cut. What is *not* covered is a cold navigation between app routes: the
 * service worker caches nothing until phase-09 (`public/sw.js` says so deliberately), so reaching
 * a route the browser has not loaded yet still needs the network. That is the offline app shell,
 * and it is phase-09's to build — so the network is cut after landing on the review screen rather
 * than before, which is also what actually happens to a student whose train enters a tunnel.
 */
test('parsing and review work with the network cut', async ({ page, context, browserName }) => {
  await openNew(page);
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  await expect(page.getByText('Drop the notes you already have')).toBeVisible();

  await context.setOffline(true);

  // The normaliser, the block segmentation and the draft write are all local.
  await page.getByLabel('Or paste your notes').fill(RAW_MD.slice(0, 1200));
  await page.getByRole('button', { name: 'Add pasted notes' }).click();
  await waitForRead(page);

  // Reading a *file* is local too — mammoth, pdf.js and the text reader never touch a server.
  //
  // Not asserted under WebKit, and the reason is the harness rather than the product: Playwright
  // hands WebKit an uploaded file through the browser process, and reading it back while the
  // context is offline fails with "The I/O read operation failed". A real iPhone reading a file
  // off its own disk does no such thing. Everything above and below this line still runs there.
  if (browserName !== 'webkit') {
    await upload(page, [resolve(FIXTURES, 'ap-chem-u1-raw.md')]);
    await expect(page.getByText(/^Read /)).toContainText(/characters/, { timeout: 30_000 });
  }
  await context.setOffline(false);

  // The navigation itself is the one part that still needs a network — see the comment above.
  await page.getByRole('button', { name: 'Review what we found' }).click();
  await expect(page.getByRole('combobox', { name: 'Subject' })).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByText(/Offline — everything on this screen still works/)).toBeVisible();

  // Detection, the context fields, editing and the draft store all carry on.
  await expect(page.getByRole('combobox', { name: 'Subject' })).toHaveValue('Chemistry');
  const first = page.getByRole('textbox', { name: /Text of the block/ }).first();
  await first.fill('# Edited with no network');
  await expect(first).toHaveValue('# Edited with no network');
  await page.waitForTimeout(900);

  const persisted = await page.evaluate(async () => {
    const request = indexedDB.open('lumen');
    const db: IDBDatabase = await new Promise((done) => {
      request.onsuccess = () => done(request.result);
    });
    const rows: { doc: { blocks: { text: string }[] } }[] = await new Promise((done) => {
      const all = db.transaction('drafts').objectStore('drafts').getAll();
      all.onsuccess = () => done(all.result);
    });
    db.close();
    return rows.some((row) =>
      row.doc.blocks.some((block) => block.text === '# Edited with no network'),
    );
  });
  expect(persisted).toBe(true);

  await context.setOffline(false);
});

/**
 * The block controls are quiet until hovered, which is a decision that can only be wrong in one
 * way: if they become unreachable without a mouse. `opacity-0` elements are still focusable and
 * still announced, and the block reveals them on `:focus-within` — but that is a claim about CSS,
 * and the only way to know is to press the keys.
 */
test('every block control is reachable and usable from the keyboard', async ({
  page,
  browserName,
}) => {
  await openNew(page);
  await upload(page, [resolve(FIXTURES, 'ap-chem-u1-raw.md')]);
  await waitForRead(page);
  await page.getByRole('button', { name: 'Review what we found' }).click();

  const first = page.getByRole('textbox', { name: /Text of the block/ });
  const moveDown = page.getByRole('button', { name: /Move block .* down/ }).first();

  // Focusing anywhere in the block reveals its controls — the `:focus-within` claim.
  await first.first().focus();
  await expect(moveDown).toBeVisible();

  // And they are in the tab order after the text. WebKit only tabs to buttons when macOS "Full
  // Keyboard Access" is on, which Playwright does not set, so the traversal is asserted on
  // Chromium; the reveal above and the operation below are asserted everywhere.
  if (browserName === 'chromium') {
    await page.keyboard.press('Tab');
    await expect(moveDown).toBeFocused();
  }

  const before = await first.first().inputValue();
  await moveDown.focus();
  await page.keyboard.press('Enter');

  await expect(first.first()).not.toHaveValue(before);
  await expect(first.nth(1)).toHaveValue(before);
});
