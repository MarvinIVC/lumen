# docs

## screenshots/

Proof for the phase-01 definition of done: each hero screen in light and dark, desktop and mobile.

Regenerate with the dev server running:

```bash
node scripts/screenshots.mjs           # all three screens
node scripts/screenshots.mjs note      # just the gold fixture
```

`prefers-color-scheme` is emulated rather than toggled through the UI, so the shots show what a
visitor sees on a device set that way — the case the palette was actually designed for.
