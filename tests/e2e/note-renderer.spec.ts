import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * The phase-01 verification steps, as checks (prompts/phase-01 §Verification).
 *
 * These run against `/dev/note` — the gold fixture through the real `NoteDocument`. They are the
 * difference between "the renderer looked right when I built it" and "the renderer is still
 * right", which matters most for the parts that are easy to break silently: the theme re-render
 * of third-party SVG, and the 375px layout.
 */

test.describe('the finished note', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev/note');
    // KaTeX, Mermaid and smiles-drawer all arrive by dynamic import.
    await expect(page.locator('.katex').first()).toBeVisible();
  });

  test('renders maths, chemistry, a diagram, a structure and a chart', async ({ page }) => {
    // mhchem: the fixture's mercury molar mass is written \ce{Hg}.
    await expect(page.locator('.katex').first()).toBeVisible();
    await expect(page.getByText('Hg', { exact: false }).first()).toBeVisible();

    await expect(page.locator('.lumen-diagram svg')).toBeVisible();
    // smiles-drawer paints bonds as <line>/<path> and heteroatoms as <text>; asserting on any one
    // of those would couple the test to its internals, so assert that it drew *something*.
    await expect.poll(() => page.locator('svg.lumen-structure > *').count()).toBeGreaterThan(5);
    await expect(page.getByRole('img', { name: /mass spectrum of chlorine/i })).toBeVisible();
  });

  test('shows the provenance surfaces: corrections, the student attempt, the verify badge', async ({
    page,
  }) => {
    await expect(page.getByRole('heading', { name: 'What to relearn' })).toBeVisible();
    await expect(page.getByText('Your line, corrected')).toBeVisible();
    await expect(page.getByText('Double-check this')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Confirm these with your teacher/ }),
    ).toBeVisible();
  });

  test('"My original" hides AI content and "Everything" brings it back', async ({ page }) => {
    const added = page.locator('[data-origin="ai-added"]');
    await expect(added.first()).toBeVisible();

    await page.getByRole('radio', { name: 'My original' }).click();
    await expect(added).toHaveCount(0);

    await page.getByRole('radio', { name: 'Everything' }).click();
    await expect(added.first()).toBeVisible();
  });

  test('every formula states its units', async ({ page }) => {
    // The "where:" list is the rubric's non-negotiable; an empty unit would render as a blank cell.
    const units = page.locator('dl dd .font-mono');
    const count = await units.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      await expect(units.nth(index)).not.toBeEmpty();
    }
  });
});

test.describe('theme', () => {
  test('re-renders Mermaid against the new palette when the theme flips', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/dev/note');

    const diagram = page.locator('.lumen-diagram svg');
    await expect(diagram).toBeVisible();

    const lightFill = await nodeFill(page);
    await page.emulateMedia({ colorScheme: 'dark' });

    // Mermaid bakes literal colors into its SVG, so this only passes if the diagram was actually
    // re-rendered — a CSS-only theme would leave the light fill in place.
    await expect.poll(async () => nodeFill(page)).not.toBe(lightFill);
  });
});

async function nodeFill(page: Page): Promise<string> {
  return page.evaluate(() => {
    const node = document.querySelector('.lumen-diagram svg .node rect, .lumen-diagram svg rect');
    return node ? getComputedStyle(node).fill : '';
  });
}

test.describe('at 375px', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('nothing scrolls sideways', async ({ page }) => {
    await page.goto('/dev/note');
    await expect(page.locator('.katex').first()).toBeVisible();

    const overflows = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth - root.clientWidth;
    });
    expect(overflows).toBeLessThanOrEqual(1);
  });

  test('margin notes fold into details and the outline becomes a sheet', async ({ page }) => {
    await page.goto('/dev/note');
    await expect(page.locator('.katex').first()).toBeVisible();

    const note = page.locator('[data-margin-note]').first();
    await expect(note).not.toHaveAttribute('open', /.*/);
    await note.locator('summary').click();
    await expect(note).toHaveAttribute('open', '');

    await page.getByRole('button', { name: 'Outline' }).click();
    await expect(page.getByRole('dialog', { name: 'Sections' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Sections' })).toBeHidden();
  });
});

test.describe('print', () => {
  // paged.js measures once, after fonts and KaTeX; give it room on a cold cache.
  test.slow();

  test('lays the note into pages with a running header and folios', async ({ page }) => {
    await page.goto('/dev/note/print');
    await expect(page.locator('.pagedjs_page').first()).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => page.locator('.pagedjs_page').count()).toBeGreaterThan(6);

    // paged.js fills its margin boxes through a CSS `content:` pseudo-element, so the header and
    // the folio are not in `textContent` at all — `toContainText` reports an empty page while the
    // header sits plainly on screen. Read the computed content.
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

    // The header comes from the course line via `string-set`, and resolves to real text.
    expect(boxes.header).toContain('AP Chemistry');
    // The folio is a counter, which `getComputedStyle` reports unevaluated — so the check is that
    // the box exists and carries the rule, which is the part that can actually regress.
    expect(boxes.folio).toContain('counter(page)');
  });

  test('resolves margin notes into numbered endnotes', async ({ page }) => {
    await page.goto('/dev/note/print');
    await expect(page.locator('.pagedjs_page').first()).toBeVisible({ timeout: 30_000 });

    // The `<details>` shell must not survive into print, and the note must still be findable.
    await expect(page.locator('[data-margin-note]')).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Notes', exact: true })).toBeVisible();
    await expect(page.locator('#endnote-1')).toContainText('Have No Fear Of Ice Cold Beer');
  });

  test('renders every formula as maths rather than as raw LaTeX', async ({ page }) => {
    await page.goto('/dev/note/print');
    await expect(page.locator('.pagedjs_page').first()).toBeVisible({ timeout: 30_000 });

    // A boxed answer that reaches the page as `\ce{...}` in a mono chip is the failure mode this
    // catches — it looks like a rendering bug and is a parsing one.
    const raw = await page.evaluate(() =>
      [...document.querySelectorAll('code')]
        .map((element) => element.textContent ?? '')
        .filter((text) => text.includes('\\')),
    );
    expect(raw).toEqual([]);
  });
});

test.describe('reduced motion', () => {
  test('nothing animates — state changes are instant (03-DESIGN.md §7)', async ({ page }) => {
    // `emulateMedia` rather than `test.use({ reducedMotion })`: the fixture form is silently
    // overridden by the device preset in playwright.config.ts, and a preference that is not
    // actually set makes this test pass for the wrong reason.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/dev/note');
    await expect(page.locator('.katex').first()).toBeVisible();

    // §7 is explicit that reduced motion means *no* motion rather than less of it, so the check
    // is that every animation and transition on the page is effectively zero — not merely short.
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
      true,
    );

    const moving = await page.evaluate(() =>
      [...document.querySelectorAll('*')]
        .map((element) => {
          const style = getComputedStyle(element);
          return {
            tag: element.tagName,
            animation: style.animationDuration,
            transition: style.transitionDuration,
          };
        })
        .filter((entry) => {
          const seconds = (value: string) =>
            value.split(',').some((part) => Number.parseFloat(part) > 0.001);
          return seconds(entry.animation) || seconds(entry.transition);
        })
        .slice(0, 5),
    );

    expect(moving).toEqual([]);
  });
});
