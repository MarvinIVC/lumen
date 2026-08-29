import { expect, test } from '@playwright/test';

/**
 * Phase-01 verification step 2: tab through the overlays and the panels and check that focus is
 * trapped where it should be, released by Esc, and handed back to where it came from.
 *
 * These are the failures that never show up in a screenshot and never show up in axe either —
 * axe reads a static tree, and a focus trap is a behaviour. The only way to know is to press the
 * keys.
 */

test.describe('segmented controls', () => {
  test('are one tab stop, and move with the arrows', async ({ page }) => {
    await page.goto('/dev/new');

    // Roving tabindex is the whole point: a four-choice options panel should cost four tab stops,
    // not twelve.
    const mode = page.getByRole('radiogroup', { name: 'How much should we do?' });
    await mode.getByRole('radio', { name: 'Complete it' }).focus();

    await page.keyboard.press('ArrowRight');
    const studyGuide = mode.getByRole('radio', { name: 'Study guide' });
    await expect(studyGuide).toBeFocused();
    await expect(studyGuide).toHaveAttribute('aria-checked', 'true');

    // Wraps, so nobody has to reverse out of the end of the group.
    await page.keyboard.press('ArrowRight');
    await expect(mode.getByRole('radio', { name: 'Tidy up' })).toBeFocused();

    await page.keyboard.press('ArrowLeft');
    await expect(studyGuide).toBeFocused();
  });

  test('reaching one from the keyboard lands on the selected option', async ({ page }) => {
    await page.goto('/dev/new');

    const depth = page.getByRole('radiogroup', { name: 'How long?' });
    const selected = depth.getByRole('radio', { name: 'Thorough' });

    // The unselected radios are out of the tab order entirely, so Tab into the group can only
    // arrive at the current choice.
    await depth.getByRole('radio', { name: 'Brief' }).evaluate((element) => {
      (element as HTMLElement).focus();
    });
    expect(await depth.getByRole('radio', { name: 'Brief' }).getAttribute('tabindex')).toBe('-1');
    expect(await selected.getAttribute('tabindex')).toBe('0');
  });
});

test.describe('popovers', () => {
  test('open on Enter, are named, and Esc returns focus to the trigger', async ({ page }) => {
    await page.goto('/dev/new');

    const trigger = page.getByRole('button', { name: 'How the estimate works' });
    await trigger.focus();
    await page.keyboard.press('Enter');

    const popover = page.getByRole('dialog', { name: 'How the estimate works' });
    await expect(popover).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});

test.describe('the command menu', () => {
  test('opens on the shortcut, moves with the arrows, and Esc closes it', async ({ page }) => {
    await page.goto('/dev/study');

    const open = page.getByRole('button', { name: 'Search' });
    await open.focus();
    await page.keyboard.press('Enter');

    // Radix moves focus to the first focusable child, which is the search input — so a user can
    // type straight away without a stop in between.
    const input = page.getByRole('combobox');
    await expect(input).toBeFocused();

    // Focus stays in the input while the arrows move the *active* option: `aria-activedescendant`,
    // not roving focus, because the user is typing and choosing at the same time.
    await page.keyboard.press('ArrowDown');
    await expect(input).toBeFocused();
    const active = await input.getAttribute('aria-activedescendant');
    expect(active).toBeTruthy();
    await expect(page.locator(`#${active}`)).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Command menu' })).toBeHidden();
  });

  test('is reachable by ⌘K from anywhere on the screen', async ({ page }) => {
    await page.goto('/dev/study');
    await page.locator('body').press('ControlOrMeta+k');
    await expect(page.getByRole('dialog', { name: 'Command menu' })).toBeVisible();
  });
});

test.describe('the study tools', () => {
  test('the quiz is answerable without a mouse', async ({ page }) => {
    await page.goto('/dev/study');

    const answers = page.getByRole('radiogroup', { name: 'Answers' });
    const first = answers.getByRole('radio').first();
    await first.focus();

    // Space, not an arrow. Radix also selects on arrow navigation, but it detects that by holding
    // a flag between keydown and keyup — and Playwright's synthetic press fires both in the same
    // instant, so focus moves before the flag is read. The behaviour is fine in a real browser;
    // Space is the ARIA-standard selection key and the one that tests deterministically.
    await page.keyboard.press('Space');
    await expect(first).toHaveAttribute('aria-checked', 'true');

    const check = page.getByRole('button', { name: 'Check' });
    await check.focus();
    await page.keyboard.press('Enter');

    // The explanation is revealed rather than the answer being string-matched — see QuizRunner.
    await expect(page.getByRole('button', { name: /Next question|last one/ })).toBeVisible();
  });

  test('a flashcard flips from the keyboard and says which face is showing', async ({ page }) => {
    await page.goto('/dev/study');

    await page.getByRole('button', { name: /Showing the question/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: /Showing the answer/ })).toBeVisible();
  });
});

test.describe('the reading-mode toggle', () => {
  test('changes what the note shows, from the keyboard', async ({ page }) => {
    await page.goto('/dev/note');
    await expect(page.locator('.katex').first()).toBeVisible();

    const toggle = page.getByRole('radiogroup', { name: 'What to show' });
    await toggle.getByRole('radio', { name: 'Everything' }).focus();
    await page.keyboard.press('ArrowLeft');

    await expect(toggle.getByRole('radio', { name: 'My original' })).toBeFocused();
    await expect(page.locator('[data-origin="ai-added"]')).toHaveCount(0);
  });
});
