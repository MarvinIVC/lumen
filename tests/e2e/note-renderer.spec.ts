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
