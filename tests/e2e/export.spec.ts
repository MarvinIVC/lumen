import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Phase-07's export surface, walked (06 §2).
 *
 * The note is seeded straight into IndexedDB — everything here happens *after* a generation, and
 * re-running one per test would spend thirty seconds a case proving what `generate.spec.ts`
 * already proves. What is not faked is the storage or the rendering: the page really reads the
 * note back, really renders every diagram, and really lays it into pages.
 */
const RECORDED = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/ai-evals/recorded/ap-chem-u1.json'), 'utf8'),
) as { response: Record<string, unknown> };

const CONTEXT = {
  subject: 'Chemistry',
  curriculum: 'AP',
  course: 'AP Chemistry',
  unit: 'Unit 1',
  topic: '1.1',
  language: 'en',
};
const OPTIONS = { mode: 'complete', depth: 'match', visuals: 'auto', voice: 'keep-mine' };

/**
 * Writes a finished note into the database the app itself created.
 *
 * Phase-06's lesson, inherited: opening `indexedDB.open('lumen', n)` before the app has ever run
 * creates an empty database with no object stores rather than running the app's upgrade, and then
 * every read fails. Loading `/app` first and waiting for it to settle is what guarantees the real
 * schema exists before anything is put into it.
 */
async function seedNote(page: Page): Promise<string> {
  await page.goto('/app');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('main')).toBeVisible();

  return page.evaluate(
    async ({ doc, context, options }) => {
      const id = `nte-exp-${Math.random().toString(36).slice(2, 8)}`;
      const note = {
        id,
        localId: `drf-exp-${id}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        title: (doc as { title: string }).title,
        status: 'ready',
        context,
        options,
        draftId: `drf-exp-${id}`,
        source: { kind: 'paste', filenames: ['pasted'], extractedCharCount: 900, ocrPages: 0 },
        doc: { blocks: [{ kind: 'paragraph', text: 'Atomic mass = molar mass' }], meta: {} },
        generated: { ...doc, context, options },
        model: 'deepseek-v4-flash',
        generatedAt: Date.now(),
      };

      await new Promise<void>((done, fail) => {
        const open = indexedDB.open('lumen');
        open.onerror = () => fail(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('notes', 'readwrite');
          tx.objectStore('notes').put(note);
          tx.oncomplete = () => {
            open.result.close();
            done();
          };
          tx.onerror = () => fail(tx.error);
        };
      });

      return id;
    },
    { doc: RECORDED.response, context: CONTEXT, options: OPTIONS },
  );
}

/**
 * Pagination is expensive and engine-independent, and phase-01 learned what running it on every
 * project costs: enough to blow a 20-minute CI job on its own. Printing is a desktop action.
 */
test.describe('print route', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'pagination is expensive and engine-independent; chromium is enough',
  );
  test.slow();

  test('lays a real note into pages, with the running header and both appendices', async ({
    page,
  }) => {
    const id = await seedNote(page);
    await page.goto(`/app/note/${id}/print`);

    await expect(page.locator('.pagedjs_page').first()).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => page.locator('.pagedjs_page').count()).toBeGreaterThan(3);

    // paged.js fills its margin boxes through a CSS `content:` pseudo-element, so the header and
    // the folio are invisible to `textContent` — a `toContainText` would report an empty page
    // while the header sits plainly on screen. Read the computed content instead.
    const boxes = await page.evaluate(() => {
      const second = document.querySelectorAll('.pagedjs_page')[1];
      const read = (selector: string) => {
        const element = second?.querySelector(`${selector} .pagedjs_margin-content`);
        return element ? getComputedStyle(element, '::after').content : '';
      };
      return {
        header: read('.pagedjs_margin-top-left'),
        folio: read('.pagedjs_margin-bottom-right'),
      };
    });

    // The running header is the course *and* the unit, taken off the note through `string-set`.
    expect(boxes.header).toContain('AP Chemistry');
    expect(boxes.header).toContain('Unit 1');
    expect(boxes.folio).toContain('counter(page)');

    // Both appendices, which 06 §5 says ship whatever else is turned off.
    await expect(page.getByRole('heading', { name: /relearn|Corrections/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Notes', exact: true })).toBeVisible();

    // Sidenotes became endnotes: the `<details>` shell must not survive into print.
    await expect(page.locator('[data-margin-note]')).toBeHidden();

    // Vector text, not a picture of text — the whole reason this is a print route and not a
    // server-side renderer. Real KaTeX in the page means the PDF has selectable maths.
    await expect.poll(() => page.locator('.pagedjs_page .katex').count()).toBeGreaterThan(3);

    // A formula that reached the page as `\ce{...}` in a mono chip is a parsing bug wearing a
    // rendering bug's clothes.
    const raw = await page.evaluate(() =>
      [...document.querySelectorAll('code')]
        .map((element) => element.textContent ?? '')
        .filter((text) => text.includes('\\')),
    );
    expect(raw).toEqual([]);
  });

  test('says so, rather than laying out nothing, when the note was never generated', async ({
    page,
  }) => {
    await page.goto('/app');
    await page.waitForLoadState('networkidle');
    const id = await page.evaluate(async () => {
      const id = 'nte-exp-ungenerated';
      await new Promise<void>((done, fail) => {
        const open = indexedDB.open('lumen');
        open.onerror = () => fail(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('notes', 'readwrite');
          tx.objectStore('notes').put({
            id,
            localId: id,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            title: 'Not yet rebuilt',
            status: 'draft',
            context: {},
            options: {},
            draftId: id,
            source: { kind: 'paste', filenames: [], extractedCharCount: 0, ocrPages: 0 },
            doc: { blocks: [], meta: {} },
          });
          tx.oncomplete = () => {
            open.result.close();
            done();
          };
          tx.onerror = () => fail(tx.error);
        };
      });
      return id;
    });

    await page.goto(`/app/note/${id}/print`);
    await expect(page.getByText(/nothing to print yet/i)).toBeVisible({ timeout: 20_000 });
  });
});
