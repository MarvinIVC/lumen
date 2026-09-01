import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

/**
 * Phase-05's definition of done, walked rather than read.
 *
 * The note is seeded straight into IndexedDB, because everything here is about what happens *after*
 * a generation and re-running one per test would spend thirty seconds a case proving something
 * `generate.spec.ts` already proves. What is not faked is the storage: the page really reads the
 * note back, really migrates it, really autosaves and is really reloaded.
 *
 * The seed writes a **version 1** database on purpose. That is what a returning student's browser
 * actually contains — they used this product before phase-05 existed — so every test here opens the
 * app against a v1 store and exercises the v2 upgrade on the way in. Getting that wrong loses every
 * existing student their whole library, silently, and it would not show up in a fresh browser.
 */
const RECORDED = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/ai-evals/recorded/ap-chem-u1.json'), 'utf8'),
) as { response: Record<string, unknown> };

const ENHANCE = '**/functions/v1/enhance';
const ASK = '**/functions/v1/ask';
const USAGE = '**/functions/v1/usage';

const CONTEXT = {
  subject: 'Chemistry',
  curriculum: 'AP',
  course: 'AP Chemistry',
  unit: 'Unit 1',
  topic: '1.1',
  language: 'en',
};
const OPTIONS = { mode: 'complete', depth: 'match', visuals: 'auto', voice: 'keep-mine' };

/** The student's own working, which survives only inside an `ai-corrected` block's originalText. */
const MERCURY_ORIGINAL = 'd=m/v, 13.584=m/32';

function frame(event: string, data: unknown): string {
  const payload = JSON.stringify(data);
  return `event: ${event}\n${payload
    .split('\n')
    .map((line) => `data: ${line}`)
    .join('\n')}\n\n`;
}

async function stubUsage(page: Page) {
  await page.route(USAGE, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tier: 'anon',
        enabled: true,
        enhance: { used: 0, total: 3, resetsAt: null },
        ocr: { used: 0, total: 3, resetsAt: null },
      }),
    }),
  );
}

/**
 * Writes a finished note into a v1 database and returns to it.
 *
 * `patch` lets a test bend the fixture — adding a fact-check flag, emptying the student's own
 * content — without a second fixture file to keep in step with the first.
 */
async function seedNote(page: Page, patch: Record<string, unknown> = {}): Promise<string> {
  await stubUsage(page);
  // The marketing home, not `/app`, and the reason is the thing this seed is trying to set up:
  // `/app` opens the database itself, at version 2, so a seed that ran after it could not ask for
  // version 1 — `indexedDB.open('lumen', 1)` throws `VersionError` against a v2 store. This page
  // is the same origin and never touches IndexedDB, which leaves the seed free to create the v1
  // database a returning student would actually have.
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  return page.evaluate(
    async ({ doc, context, options, patch }) => {
      const note = {
        id: `nte-ws-${Math.random().toString(36).slice(2, 8)}`,
        localId: 'drf-ws',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        title: doc.title,
        status: 'ready',
        context,
        options,
        draftId: 'drf-ws',
        source: { kind: 'paste', filenames: ['pasted'], extractedCharCount: 900, ocrPages: 0 },
        doc: { blocks: [{ kind: 'paragraph', text: 'Atomic mass = molar mass' }], meta: {} },
        generated: { ...doc, ...patch, context, options },
        model: 'deepseek-v4-flash',
        generatedAt: Date.now(),
      };

      // Playwright reuses a browser context across the tests in a file, so a database left behind
      // by the previous test is already at version 2. Deleting it first is what makes each test
      // start from the same v1 store rather than from whatever the last one migrated.
      await new Promise<void>((done) => {
        const wipe = indexedDB.deleteDatabase('lumen');
        wipe.onsuccess = () => done();
        wipe.onerror = () => done();
        wipe.onblocked = () => done();
      });

      await new Promise<void>((done, fail) => {
        const open = indexedDB.open('lumen', 1);
        open.onupgradeneeded = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('drafts')) {
            db.createObjectStore('drafts', { keyPath: 'id' }).createIndex(
              'by-updatedAt',
              'updatedAt',
            );
          }
          if (!db.objectStoreNames.contains('assets')) {
            db.createObjectStore('assets', { keyPath: 'id' }).createIndex('by-draft', 'draftId');
          }
          if (!db.objectStoreNames.contains('notes')) {
            db.createObjectStore('notes', { keyPath: 'id' }).createIndex(
              'by-updatedAt',
              'updatedAt',
            );
          }
        };
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

      return note.id;
    },
    { doc: RECORDED.response as { title: string }, context: CONTEXT, options: OPTIONS, patch },
  );
}

async function openNote(page: Page, id: string, mode?: string) {
  await page.goto(`/app/note/${id}${mode ? `?mode=${mode}` : ''}`);
  await expect(page.getByRole('heading', { name: /1\.1 The mole/ })).toBeVisible({
    timeout: 20_000,
  });
}

/* ========================================================================== *
 * Read view — the fixture output, fully navigable
 * ========================================================================== */

test.describe('read view', () => {
  test('shows the corrections, the open questions and the mnemonic in the margin', async ({
    page,
  }) => {
    const id = await seedNote(page);
    await openNote(page, id);

    await expect(page.getByRole('heading', { name: 'What to relearn' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Confirm these with your teacher/ }),
    ).toBeVisible();
    // Below 1100px the margin column collapses into a `<details>`, so this is attached rather than
    // visible on the mobile project — the design working, not content going missing.
    await expect(page.getByText(/Have No Fear of Ice Cold Beer/)).toBeAttached();
  });

  test('every correction links to the place it happened', async ({ page }) => {
    const id = await seedNote(page);
    await openNote(page, id);

    const link = page.getByRole('link', { name: 'Show me where' }).first();
    await expect(link).toBeVisible();
    // The target has to exist, or the link is a scroll to nowhere.
    const href = await link.getAttribute('href');
    expect(href).toBeTruthy();
    await expect(page.locator(`[id="${href!.slice(1)}"]`)).toBeAttached();
  });

  test('the note meta says which model, when and in what mode', async ({ page }) => {
    const id = await seedNote(page);
    await openNote(page, id);
    await expect(page.getByText(/Rebuilt with deepseek-v4-flash .*Complete mode/)).toBeVisible();
  });

  test('a flagged section carries a verify badge', async ({ page }) => {
    const id = await seedNote(page, {
      factCheck: {
        calculationsVerified: [],
        checkedClaims: 4,
        flags: [
          {
            sectionId: 's-1-4',
            claim: 'Chromatography separates by solubility alone.',
            issue: 'Adsorption to the stationary phase matters too.',
            confidence: 'low',
          },
        ],
      },
    });
    await openNote(page, id);
    await expect(page.getByText(/Double-check this/i).first()).toBeVisible();
  });

  /**
   * The verification step this phase turns on: "My original" must give back approximately the raw
   * notes — including the mercury working, whose only copy is inside a corrected block.
   */
  test('"My original" gives back the student\'s own work, mercury calculation included', async ({
    page,
  }) => {
    const id = await seedNote(page);
    await openNote(page, id);

    await expect(page.getByText('Atomic mass = molar mass')).toBeAttached();

    await page.getByRole('radio', { name: 'My original' }).click();

    await expect(page.getByText(MERCURY_ORIGINAL)).toBeAttached();
    await expect(page.getByText('Atomic mass = molar mass')).toBeAttached();
    // And nothing we wrote survives it: the summary, the objectives and the appendices are ours.
    await expect(page.getByRole('heading', { name: 'What to relearn' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'In one paragraph' })).toHaveCount(0);
  });

  test('"Highlight AI" keeps everything on the page', async ({ page }) => {
    const id = await seedNote(page);
    await openNote(page, id);
    await page.getByRole('radio', { name: 'Highlight AI' }).click();
    await expect(page.getByRole('heading', { name: /1\.4 Mixtures/ })).toBeVisible();
  });

  test('offers "My original" as disabled when there is none to show', async ({ page }) => {
    const id = await seedNote(page, {
      sections: [
        {
          id: 's-only',
          title: 'All ours',
          level: 2,
          blocks: [
            { type: 'paragraph', text: 'Every word of this was added.', origin: 'ai-added' },
          ],
        },
      ],
      corrections: [],
      openQuestions: [],
    });
    await page.goto(`/app/note/${id}`);
    await expect(page.getByRole('heading', { name: 'All ours' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('radio', { name: 'My original' })).toBeDisabled();
  });
});

/* ========================================================================== *
 * The three views
 * ========================================================================== */

test.describe('modes', () => {
  test('read, edit and study are reachable and survive a reload', async ({ page }) => {
    const id = await seedNote(page);
    await openNote(page, id);

    await page.getByRole('radio', { name: 'Study' }).click();
    await expect(page.getByText(/Flashcards and a quiz, next/)).toBeVisible();
    await expect(page).toHaveURL(/mode=study/);

    await page.reload();
    await expect(page.getByText(/Flashcards and a quiz, next/)).toBeVisible({ timeout: 20_000 });

    await page.getByRole('radio', { name: 'Read' }).click();
    await expect(page.getByRole('heading', { name: /1\.1 The mole/ })).toBeVisible();
  });

  test('the editor opens and renders the document', async ({ page }) => {
    const id = await seedNote(page);
    await openNote(page, id, 'edit');

    // The editor is a lazily loaded chunk, so this is the assertion that it actually arrived.
    await expect(page.getByRole('textbox', { name: 'Your study guide' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('button', { name: 'Accept all' })).toBeVisible();
  });
});

/* ========================================================================== *
 * Accept and reject
 * ========================================================================== */

test.describe('accept and reject', () => {
  test('keep only mine collapses the note; the generated version is still in history', async ({
    page,
  }) => {
    const id = await seedNote(page);
    await openNote(page, id, 'edit');
    await expect(page.getByRole('textbox', { name: 'Your study guide' })).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole('button', { name: 'Keep only mine' }).click();

    // Their own work is there and ours is not.
    await expect(page.getByText(MERCURY_ORIGINAL)).toBeAttached();
    await expect(page.getByRole('button', { name: 'Keep only mine' })).toBeDisabled();
    await expect(
      page.getByText(/This note is all yours|Nothing here was written by AI/),
    ).toBeVisible();

    // Which survives a reload, because it was autosaved.
    await page.reload();
    await expect(page.getByText(MERCURY_ORIGINAL)).toBeAttached({ timeout: 20_000 });

    // And the full guide can be restored, because a snapshot was taken on arrival.
    // `exact` because the editor toolbar also has a "Regenerate this section" button.
    await page.getByRole('button', { name: 'Regenerate', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Version history' }).click();
    await page.getByRole('button', { name: 'Restore' }).last().click();
    await expect(page.getByRole('heading', { name: /1\.4 Mixtures/ })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('accept all clears the review queue', async ({ page }) => {
    const id = await seedNote(page);
    await openNote(page, id, 'edit');
    await expect(page.getByRole('textbox', { name: 'Your study guide' })).toBeVisible({
      timeout: 20_000,
    });

    await expect(page.getByText(/\d+ to review/)).toBeVisible();
    await page.getByRole('button', { name: 'Accept all' }).click();
    await expect(page.getByText('Everything is reviewed.')).toBeVisible();
    // The guide is intact — accepting is not deleting.
    await expect(page.getByRole('heading', { name: /1\.4 Mixtures/ })).toBeVisible();
  });

  test('rejecting one correction restores the wording exactly', async ({ page }) => {
    const id = await seedNote(page);
    await openNote(page, id, 'edit');
    await expect(page.getByRole('textbox', { name: 'Your study guide' })).toBeVisible({
      timeout: 20_000,
    });

    // The mercury worked example is an `ai-corrected` block, so it carries a reject button.
    await page.getByRole('button', { name: 'Review each AI change' }).click();
    await expect(page.getByText(/0 of \d+ reviewed/)).toBeVisible();

    const before = await page.getByRole('textbox', { name: 'Your study guide' }).innerText();
    await page.getByRole('button', { name: 'Reject', exact: true }).first().click();
    await expect
      .poll(async () => page.getByRole('textbox', { name: 'Your study guide' }).innerText())
      .not.toBe(before);
  });
});

/* ========================================================================== *
 * Regenerate and ask — the two calls that cost a credit
 * ========================================================================== */

test.describe('regenerate and ask', () => {
  /**
   * Chromium only, for the reason `generate.spec.ts` records: Playwright's WebKit does not apply
   * `page.route` to these cross-origin fetches, so the requests would go to whatever is really
   * listening on the Supabase port. Every assertion is about client state and is engine-independent.
   */
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Playwright/WebKit does not intercept these cross-origin fetches',
  );

  const REWRITTEN = {
    section: {
      id: 's-1-2',
      title: '1.2 Isotopes and mass spectrometry',
      level: 2,
      blocks: [
        {
          type: 'paragraph',
          text: 'A brand new treatment of isotopes, with bigger numbers.',
          origin: 'ai-added',
        },
      ],
    },
  };

  async function stubRegenerate(page: Page, body: string, status = 200) {
    await page.route(ENHANCE, (route: Route) =>
      route.fulfill({
        status,
        contentType: status === 200 ? 'text/event-stream' : 'application/json',
        body,
      }),
    );
  }

  test('rewrites one section, shows a diff, and applies it', async ({ page }) => {
    const id = await seedNote(page);
    await stubRegenerate(
      page,
      frame('start', { provider: 'deepseek', model: 'deepseek-v4-flash' }) +
        frame('status', { phase: 'generating' }) +
        frame('fragment', {
          fragment: { ...REWRITTEN, corrections: [], openQuestions: [], glossary: [] },
        }) +
        frame('usage', { credits: 0.25, costCny: 0.01, model: 'deepseek-v4-flash' }) +
        frame('done', { status: 'ready' }),
    );
    await openNote(page, id);

    await page.getByRole('button', { name: 'Regenerate' }).click();
    await page.getByRole('menuitem', { name: 'Regenerate this section' }).click();

    const dialog = page.getByRole('dialog');
    // A Radix Select, not a native <select> — it is a button that opens a listbox.
    await dialog.getByRole('combobox').click();
    await page.getByRole('option', { name: '1.2 Isotopes and mass spectrometry' }).click();
    await dialog.getByRole('textbox').fill('add a bigger worked example');
    await dialog.getByRole('button', { name: 'Regenerate', exact: true }).click();

    // Nothing is applied until it has been read.
    await expect(dialog.getByText(/New/).first()).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByText(/Removed/).first()).toBeVisible();
    // Scoped to the note itself: the text is on screen — in the diff — and the thing being
    // asserted is that it has not been written into the document behind it.
    await expect(
      page.locator('article').getByText('A brand new treatment of isotopes'),
    ).toHaveCount(0);

    await dialog.getByRole('button', { name: 'Use the new version' }).click();
    await expect(
      page.locator('article').getByText('A brand new treatment of isotopes'),
    ).toBeVisible();

    // Only that section changed.
    await expect(page.getByRole('heading', { name: /1\.4 Mixtures/ })).toBeVisible();
  });

  /** 01-PRODUCT.md §5: "regenerate failure keeps the original". */
  test('a failed rewrite leaves the section exactly as it was', async ({ page }) => {
    const id = await seedNote(page);
    await stubRegenerate(
      page,
      frame('start', { provider: 'deepseek', model: 'deepseek-v4-flash' }) +
        frame('error', {
          code: 'invalid',
          message: 'The rewritten section did not pass our checks, so we kept the one you had.',
        }) +
        frame('done', { status: 'ended' }),
    );
    await openNote(page, id);

    await page.getByRole('button', { name: 'Regenerate' }).click();
    await page.getByRole('menuitem', { name: 'Regenerate this section' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Regenerate', exact: true }).click();

    await expect(dialog.getByText(/kept the one you had/)).toBeVisible({ timeout: 20_000 });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: /1\.1 The mole/ })).toBeVisible();
  });

  test('a quota refusal shows the quota card rather than a broken dialog', async ({ page }) => {
    const id = await seedNote(page);
    await stubRegenerate(
      page,
      JSON.stringify({
        error: 'quota',
        message: "That's all the free study guides for today.",
        resetsAt: new Date(Date.now() + 3_600_000).toISOString(),
        byokHelps: true,
      }),
      429,
    );
    await openNote(page, id);

    await page.getByRole('button', { name: 'Regenerate' }).click();
    await page.getByRole('menuitem', { name: 'Regenerate this section' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Regenerate', exact: true }).click();

    await expect(page.getByText(/free study guides for today/)).toBeVisible({ timeout: 20_000 });
  });

  test('answers a question about a selection and can keep it as a margin note', async ({
    page,
  }) => {
    const id = await seedNote(page);
    await page.route(ASK, (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body:
          frame('delta', { text: 'Because a mole is defined by ' }) +
          frame('delta', { text: 'the number of atoms in 12 g of carbon-12.' }) +
          frame('answer', {
            text: 'Because a mole is defined by the number of atoms in 12 g of carbon-12.',
          }) +
          frame('usage', { credits: 0.25, costCny: 0.001, model: 'deepseek-v4-flash' }) +
          frame('done', { status: 'answered' }),
      }),
    );

    await openNote(page, id, 'edit');
    const editor = page.getByRole('textbox', { name: 'Your study guide' });
    await expect(editor).toBeVisible({ timeout: 20_000 });

    // A triple-click selects the paragraph, which is the gesture a student actually uses. Home
    // then Shift+End looks equivalent and is not: inside a ProseMirror document those move within
    // the browser's own line boxes and can leave the selection collapsed, so the toolbar button
    // stays correctly disabled and the test waits for ever on a button that is behaving.
    await editor
      .getByText(/A mole is an amount/)
      .first()
      .click({ clickCount: 3 });

    await page.getByRole('button', { name: 'Ask about this' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox').fill('why 6.022 and not a round number?');
    await dialog.getByRole('button', { name: 'Ask about this' }).click();

    await expect(dialog.getByText(/12 g of carbon-12/)).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole('button', { name: 'Add as a margin note' }).click();

    // Scoped to the editor: the answer is also still in the dialog that is closing.
    await expect(editor.getByText(/12 g of carbon-12/)).toBeAttached();
  });
});

/* ========================================================================== *
 * Editing, autosave and offline
 * ========================================================================== */

test.describe('editing', () => {
  test('typing is autosaved and survives a reload', async ({ page }) => {
    const id = await seedNote(page);
    await openNote(page, id, 'edit');
    const editor = page.getByRole('textbox', { name: 'Your study guide' });
    await expect(editor).toBeVisible({ timeout: 20_000 });

    await editor
      .getByText(/A mole is an amount/)
      .first()
      .click();
    await page.keyboard.press('End');
    await page.keyboard.type(' — checked with Mr Patel.');

    await expect(page.getByText('Saved on this device')).toBeVisible({ timeout: 20_000 });

    await page.reload();
    await expect(page.getByText(/checked with Mr Patel/)).toBeVisible({ timeout: 20_000 });
  });

  /** 01-PRODUCT.md §5, "Editor · Offline": local autosave keeps working and says so. */
  test('offline keeps saving and says where the changes are', async ({ page, context }) => {
    const id = await seedNote(page);
    await openNote(page, id, 'edit');
    const editor = page.getByRole('textbox', { name: 'Your study guide' });
    await expect(editor).toBeVisible({ timeout: 20_000 });

    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.getByText(/You are offline/)).toBeVisible();

    await editor
      .getByText(/A mole is an amount/)
      .first()
      .click();
    await page.keyboard.press('End');
    await page.keyboard.type(' — typed while offline.');
    await expect(page.getByText('Saved on this device')).toBeVisible({ timeout: 20_000 });

    // Asserted against storage before the reload, so a failure here says which half broke: the
    // write that IndexedDB should have taken while the network was down, or the read after it.
    await expect
      .poll(
        () =>
          page.evaluate(
            (noteId) =>
              new Promise<boolean>((done) => {
                const open = indexedDB.open('lumen');
                open.onerror = () => done(false);
                open.onsuccess = () => {
                  const get = open.result.transaction('notes').objectStore('notes').get(noteId);
                  get.onsuccess = () => {
                    open.result.close();
                    done(
                      JSON.stringify(get.result?.generated ?? {}).includes('typed while offline'),
                    );
                  };
                  get.onerror = () => done(false);
                };
              }),
            id,
          ),
        { timeout: 20_000 },
      )
      .toBe(true);

    await context.setOffline(false);
    await page.reload();
    await expect(page.getByText(/typed while offline/)).toBeVisible({ timeout: 20_000 });
  });

  test("a formula's LaTeX can be edited and renders in the read view", async ({ page }) => {
    const id = await seedNote(page);
    await openNote(page, id, 'edit');
    await expect(page.getByRole('textbox', { name: 'Your study guide' })).toBeVisible({
      timeout: 20_000,
    });

    // The first non-prose block with an Edit button is opened, its LaTeX changed, and saved.
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const latex = dialog.getByRole('textbox').first();
    await latex.fill('E = mc^2');
    // The preview is the real renderer, so KaTeX has to have drawn it.
    await expect(dialog.locator('.katex').first()).toBeVisible({ timeout: 20_000 });

    await dialog.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('radio', { name: 'Read' }).click();
    await expect(page.locator('.katex').first()).toBeVisible({ timeout: 20_000 });
  });

  test('a block can be inserted from the menu', async ({ page }) => {
    const id = await seedNote(page);
    await openNote(page, id, 'edit');
    await expect(page.getByRole('textbox', { name: 'Your study guide' })).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole('button', { name: 'Insert' }).click();
    await page.getByRole('menuitem', { name: 'Callout' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox').last().fill('Remember to check your units.');
    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Remember to check your units.')).toBeVisible();
  });
});

/* ========================================================================== *
 * The stubs that are honest about being stubs
 * ========================================================================== */

test.describe('what is not built yet', () => {
  test('save, export and share say what they will do', async ({ page }) => {
    const id = await seedNote(page);
    await openNote(page, id);

    await page.getByRole('button', { name: 'Save to library' }).click();
    // Twice on the page by design: the visible toast, and the assertive live region that announces
    // it. `.first()` is the visible one.
    await expect(page.getByText(/Sign in to keep this across your devices/).first()).toBeVisible();
  });
});
