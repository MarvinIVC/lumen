import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

/**
 * Phase-04's definition of done on the client side, as a suite.
 *
 * Everything here is about what a student sees while a generation is happening or failing, so the
 * provider is stubbed at the network boundary rather than mocked in code: the page really opens
 * an event stream, really parses it, really writes to IndexedDB and really reads it back on a
 * reload. 01-PRODUCT.md §5 lists the states this walks — quota, community limit, refusal,
 * resumable error, cancel — and walking them is how phase-03 found the bug reading them did not.
 */
const FIXTURES = resolve(process.cwd(), 'fixtures');
const RAW_MD = readFileSync(resolve(FIXTURES, 'ap-chem-u1-raw.md'), 'utf8');
const RECORDED = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/ai-evals/recorded/ap-chem-u1.json'), 'utf8'),
) as {
  response: { sections: { id: string; title: string }[]; title: string } & Record<string, unknown>;
};

const ENHANCE = '**/functions/v1/enhance';
const USAGE = '**/functions/v1/usage';

/** One SSE frame, framed the way `lib/ai/providers/sse.ts` writes them. */
function frame(event: string, data: unknown): string {
  const payload = JSON.stringify(data);
  return `event: ${event}\n${payload
    .split('\n')
    .map((line) => `data: ${line}`)
    .join('\n')}\n\n`;
}

/** A successful generation, delivered as the edge function would deliver it. */
function successStream(): string {
  const doc = RECORDED.response;
  const head = frame('start', { provider: 'deepseek', model: 'deepseek-v4-flash' });
  const status = frame('status', { phase: 'generating', key: 'sections' });
  const meta = frame('head', {
    head: {
      title: doc.title,
      summary: 'A streamed summary.',
      objectives: ['Convert mass to moles'],
    },
  });
  const sections = doc.sections
    .map((section, index) => frame('section', { index, section }))
    .join('');
  const finished = frame('document', { document: doc, issues: [], degraded: false });
  const usage = frame('usage', {
    tokensIn: 4100,
    tokensOut: 6400,
    cachedTokensIn: 0,
    cacheHit: false,
    fallbackUsed: false,
    costCny: 0.07,
    credits: 1,
    model: 'deepseek-v4-flash',
    provider: 'deepseek',
  });
  return head + status + meta + sections + finished + usage + frame('done', { status: 'ready' });
}

async function stubUsage(page: Page, used = 0) {
  await page.route(USAGE, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tier: 'anon',
        enabled: true,
        enhance: { used, total: 3, resetsAt: null },
        ocr: { used: 0, total: 3, resetsAt: null },
      }),
    }),
  );
}

async function stubEnhance(page: Page, body: string, status = 200) {
  await page.route(ENHANCE, (route: Route) =>
    route.fulfill({
      status,
      contentType: status === 200 ? 'text/event-stream' : 'application/json',
      headers: status === 200 ? { 'x-lumen-anon-id': 'a1.test.1.signature' } : {},
      body,
    }),
  );
}

/** Runs the real ingestion flow up to the note page, which is where generation starts. */
async function reachNote(page: Page) {
  await page.goto('/app/new');
  await page.waitForLoadState('networkidle');
  await page.getByRole('textbox', { name: /paste/i }).fill(RAW_MD);
  await page.getByRole('button', { name: 'Add pasted notes' }).click();
  await expect(page.getByText(/^Read /)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Review what we found' }).click();
  await expect(page).toHaveURL(/\/app\/review\?d=/);
  await page
    .getByRole('button', { name: /Create|study guide/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/app\/note\//, { timeout: 20_000 });
}

test.describe('generation', () => {
  /**
   * Chromium only, and the reason is the harness rather than the product: Playwright's WebKit
   * does not apply `page.route` to these cross-origin `fetch` calls, so the requests go to
   * whatever is really listening on the Supabase port — which on a developer's machine is the
   * local stack and in CI is nothing. Every assertion below is about client state and is
   * engine-independent.
   *
   * What is *not* engine-independent is IndexedDB, which is where WebKit has bitten this project
   * twice already (phase-03: a canvas Blob it refuses to store; a WebP encoder it does not have).
   * So the storage half runs on both engines, in its own suite below, seeded directly.
   */
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Playwright/WebKit does not intercept these cross-origin fetches; storage is covered separately',
  );

  test('streams the note in and leaves a finished document behind', async ({ page }) => {
    await stubUsage(page);
    await stubEnhance(page, successStream());

    await reachNote(page);

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Atomic Structure', {
      timeout: 20_000,
    });
    // The document event is authoritative, so the finished note carries the sections the server
    // sent rather than only the ones the reveal happened to catch.
    await expect(page.getByRole('heading', { name: /1\.1 The mole/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /1\.4 Mixtures/ })).toBeVisible();
    await expect(page.getByText(/Rebuilt with deepseek-v4-flash/)).toBeVisible();

    // And it survives a reload, because it was written to this device.
    await page.reload();
    await expect(page.getByRole('heading', { name: /1\.1 The mole/ })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('shows the quota card with a reset time and both offers', async ({ page }) => {
    await stubUsage(page, 3);
    await stubEnhance(
      page,
      JSON.stringify({
        error: 'quota',
        reason: 'quota',
        message: "That's all the free study guides for today.",
        resetsAt: new Date(Date.now() + 4 * 3600_000).toISOString(),
        byokHelps: true,
      }),
      429,
    );

    await reachNote(page);

    await expect(page.getByRole('heading', { name: /free study guides for today/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/in 4 hours/)).toBeVisible();
    await expect(page.getByRole('link', { name: /Add your own API key/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /See a finished example/ })).toBeVisible();
  });

  test('explains the community limit without blaming the student', async ({ page }) => {
    await stubUsage(page);
    await stubEnhance(
      page,
      JSON.stringify({
        error: 'daily-cap',
        reason: 'daily-cap',
        message: "We've hit today's community limit.",
        resetsAt: null,
        byokHelps: true,
      }),
      429,
    );

    await reachNote(page);
    await expect(page.getByRole('heading', { name: /community limit/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/notes are safe on this device/i)).toBeVisible();
  });

  test('says plainly when generation is paused, and does not offer a key as the fix', async ({
    page,
  }) => {
    await stubUsage(page);
    await stubEnhance(
      page,
      JSON.stringify({
        error: 'kill-switch',
        reason: 'kill-switch',
        message: 'Rebuilding notes is paused right now.',
        resetsAt: null,
        byokHelps: false,
      }),
      503,
    );

    await reachNote(page);
    await expect(page.getByRole('heading', { name: /paused/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('link', { name: /Add your own API key/ })).toHaveCount(0);
  });

  test('reports a refusal as a limit, not a failure, and says nothing was charged', async ({
    page,
  }) => {
    await stubUsage(page);
    await stubEnhance(
      page,
      frame('start', { provider: 'deepseek', model: 'deepseek-v4-flash' }) +
        frame('refused', { reason: 'This is an essay to rewrite, not class notes.' }) +
        frame('usage', {
          credits: 0,
          tokensIn: 1800,
          tokensOut: 40,
          cachedTokensIn: 0,
          cacheHit: false,
          fallbackUsed: false,
          costCny: 0.005,
          model: 'deepseek-v4-flash',
          provider: 'deepseek',
        }) +
        frame('done', { status: 'ended' }),
    );

    await reachNote(page);
    await expect(page.getByRole('heading', { name: /do not look like class notes/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/have not been charged/i)).toBeVisible();
  });

  test('treats a dropped connection as resumable, not as a finished note', async ({ page }) => {
    await stubUsage(page);
    // A stream that simply stops: head and one section, then nothing. No error event, no document.
    // This is what a train tunnel looks like from the client, and the honest reading is that the
    // run did not finish — not that the note is done and happens to be short.
    await stubEnhance(
      page,
      frame('start', { provider: 'deepseek', model: 'deepseek-v4-flash' }) +
        frame('head', {
          head: { title: 'Atomic Structure', summary: 'Partial.', objectives: [] },
        }) +
        frame('section', { index: 0, section: RECORDED.response.sections[0] }),
    );

    await reachNote(page);

    await expect(page.getByText(/connection dropped part-way/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /1\.1 The mole/ })).toBeVisible();
  });

  test('offers to try again after a resumable failure, keeping what arrived', async ({ page }) => {
    await stubUsage(page);
    await stubEnhance(
      page,
      frame('start', { provider: 'deepseek', model: 'deepseek-v4-flash' }) +
        frame('head', {
          head: { title: 'Atomic Structure', summary: 'Partial.', objectives: [] },
        }) +
        frame('section', { index: 0, section: RECORDED.response.sections[0] }) +
        frame('error', {
          code: 'provider',
          message: 'The model stopped responding part-way.',
          resumable: true,
        }) +
        frame('done', { status: 'ended' }),
    );

    await reachNote(page);

    await expect(page.getByText(/stopped responding part-way/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    // What streamed is kept rather than thrown away.
    await expect(page.getByRole('heading', { name: /1\.1 The mole/ })).toBeVisible();
  });
});

/**
 * The half that has to run on both engines.
 *
 * A finished study guide is the largest object this app puts in IndexedDB — the AP Chemistry
 * document is tens of kilobytes of nested arrays — and WebKit is where storage has failed before.
 * Seeding it directly needs no network, so it is not affected by the interception limitation
 * above, and it checks the thing that actually differs between engines.
 */
test.describe('a finished note on this device', () => {
  test('is stored, rendered and still there after a reload', async ({ page }) => {
    await stubUsage(page);
    await page.goto('/app');
    await page.waitForLoadState('networkidle');

    const context = {
      subject: 'Chemistry',
      curriculum: 'AP',
      course: 'AP Chemistry',
      unit: 'Unit 1',
      topic: '1.1',
      language: 'en',
    };
    const options = { mode: 'complete', depth: 'match', visuals: 'auto', voice: 'keep-mine' };

    const id = await page.evaluate(
      async ({ doc, context, options }) => {
        const note = {
          id: 'nte-e2e-stored',
          localId: 'drf-e2e',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          title: doc.title,
          status: 'ready',
          context,
          options,
          draftId: 'drf-e2e',
          source: { kind: 'paste', filenames: ['pasted'], extractedCharCount: 100, ocrPages: 0 },
          doc: { blocks: [], meta: {} },
          generated: { ...doc, context, options },
          model: 'deepseek-v4-flash',
        };

        await new Promise<void>((resolve, reject) => {
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
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const tx = open.result.transaction('notes', 'readwrite');
            tx.objectStore('notes').put(note);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          };
        });

        return note.id;
      },
      { doc: RECORDED.response, context, options },
    );

    await page.goto(`/app/note/${id}`);
    await expect(page.getByRole('heading', { name: /1\.1 The mole/ })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('heading', { name: /1\.4 Mixtures/ })).toBeVisible();
    await expect(page.getByText(/Rebuilt with deepseek-v4-flash/)).toBeVisible();

    // The whole document survived the round trip through storage — margin notes included. Asserted
    // as attached rather than visible on purpose: below 1100px the renderer collapses the margin
    // column (03-DESIGN.md §6), so on the mobile project this text is in the document and off
    // screen, which is the design working rather than content going missing.
    await expect(page.getByText(/Have No Fear of Ice Cold Beer/)).toBeAttached();

    await page.reload();
    await expect(page.getByRole('heading', { name: /1\.1 The mole/ })).toBeVisible({
      timeout: 20_000,
    });
  });
});
