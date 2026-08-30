/**
 * Renders the Open Graph card to `public/og.png`.
 *
 * This is a build script rather than an `app/opengraph-image.tsx` route, and the reason is a hard
 * limit: `next/og` pulls in resvg (1.3 MB) and yoga (87 KB) as WebAssembly, and OpenNext bundles
 * them into the Cloudflare Worker whether or not the image is prerendered. That took the Worker
 * from comfortably inside Cloudflare's 3 MiB free-plan ceiling to 3.7 MiB, and the deploy failed.
 * Rendering here means the WASM is a devDependency of the build machine and never ships.
 *
 * The PNG is committed, like `lib/render/fixture/gold-source.ts` — generated, checked in, and
 * regenerated with a named command rather than rebuilt implicitly on every install.
 *
 *   pnpm og:build
 *
 * No JSX, because this runs as plain Node with no transform. `h()` keeps it readable; the shape of
 * the tree is the same one a component would return.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og.js';

const ROOT = process.cwd();
const FONTS = join(ROOT, 'assets/og-fonts');

/**
 * The light palette, read out of `lib/design/tokens.css` at build time.
 *
 * Parsed rather than imported, because `lib/design/tokens.ts` is TypeScript and this script runs as
 * plain Node under the version in `.nvmrc`, where type stripping is still behind a flag. Parsing the
 * stylesheet is the same approach `tests/unit/tokens-sync.test.ts` already takes, and it keeps the
 * card's colours tied to the one file that defines them.
 */
async function lightPalette() {
  const css = await readFile(join(ROOT, 'lib/design/tokens.css'), 'utf8');
  // The second `:root` block is the light theme; the first holds the theme-independent scale.
  const blocks = [...css.matchAll(/:root\s*\{([^}]*)\}/g)].map((match) => match[1]);
  const light = blocks[1];

  if (!light) throw new Error('Could not find the light-theme :root block in tokens.css.');

  const palette = Object.fromEntries(
    [...light.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]),
  );

  for (const token of ['--bg', '--text', '--text-muted', '--accent', '--border-strong']) {
    if (!palette[token]) throw new Error(`tokens.css no longer defines ${token} on :root.`);
  }

  return palette;
}

const light = await lightPalette();

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Lumen';
const SIZE = { width: 1200, height: 630 };

/** Minimal createElement. satori only needs `type`, `props` and `key`. */
const h = (type, props, ...children) => ({
  type,
  key: null,
  props: { ...props, children: children.length <= 1 ? children[0] : children },
});

const [serif, sans] = await Promise.all([
  readFile(join(FONTS, 'newsreader-600.ttf')),
  readFile(join(FONTS, 'inter-400.ttf')),
]);

/*
 * The hairline and the two labels are the whole illustration: the card says what the product does
 * by showing its two states, which is the argument the hero makes with a real before and after.
 * No stock imagery, no gradient — 03-DESIGN.md §1.
 *
 * Colours come from `lib/design/tokens` rather than being retyped. satori cannot read CSS custom
 * properties, and a share card drifting away from the product's palette is the kind of thing nobody
 * notices for a year.
 */
const card = h(
  'div',
  {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      background: light['--bg'],
      padding: '72px 80px',
      fontFamily: 'Inter',
    },
  },
  h(
    'div',
    { style: { display: 'flex', alignItems: 'center' } },
    h(
      'span',
      { style: { fontFamily: 'Newsreader', fontSize: 40, color: light['--text'] } },
      APP_NAME,
    ),
    h('span', { style: { fontFamily: 'Newsreader', fontSize: 40, color: light['--accent'] } }, '.'),
  ),
  h(
    'div',
    {
      style: {
        display: 'flex',
        fontFamily: 'Newsreader',
        fontSize: 76,
        lineHeight: 1.15,
        letterSpacing: '-0.02em',
        color: light['--text'],
        maxWidth: 940,
      },
    },
    "Turn your messy notes into a study guide you'll actually reread.",
  ),
  h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: 20 } },
    h('div', { style: { display: 'flex', height: 1, background: light['--border-strong'] } }),
    h(
      'div',
      { style: { display: 'flex', justifyContent: 'space-between', fontSize: 26 } },
      h('span', { style: { color: light['--text-muted'] } }, 'Messy notes in'),
      h('span', { style: { color: light['--text'] } }, 'Complete, correct, beautiful out'),
      h('span', { style: { color: light['--accent'] } }, 'Free'),
    ),
  ),
);

const response = new ImageResponse(card, {
  ...SIZE,
  fonts: [
    { name: 'Newsreader', data: serif, weight: 600, style: 'normal' },
    { name: 'Inter', data: sans, weight: 400, style: 'normal' },
  ],
});

const png = Buffer.from(await response.arrayBuffer());
const target = join(ROOT, 'public/og.png');
await writeFile(target, png);

console.log(`Wrote ${target} (${SIZE.width}×${SIZE.height}, ${(png.length / 1024).toFixed(1)} kB)`);
