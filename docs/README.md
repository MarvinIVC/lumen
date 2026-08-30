# docs

## PHASE-LOG.md

What every completed phase decided, and what a later phase must not undo. Read it before starting a
phase; append to it when you finish one. `../AGENTS.md` is the operating manual that points here.

## screenshots/

Proof for the phase-01 definition of done: each hero screen in light and dark, desktop and mobile.

Regenerate with the dev server running:

```bash
node scripts/screenshots.mjs           # all three screens
node scripts/screenshots.mjs note      # just the gold fixture
```

`prefers-color-scheme` is emulated rather than toggled through the UI, so the shots show what a
visitor sees on a device set that way — the case the palette was actually designed for.

## Marketing screenshots

`scripts/shoot-marketing.mjs` (`pnpm shoot`) captures every marketing section at 390 px and 1440 px
in both themes, into a gitignored `screenshots/` at the repo root. `BASE=https://… pnpm shoot` points
it at a deployed preview. It is for looking at, not for diffing — the phase-02 definition of done
asks whether each section would survive being shared as a standalone image, and that is a question
you can only answer by looking at all of them.
