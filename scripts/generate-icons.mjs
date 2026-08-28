#!/usr/bin/env node
/**
 * Rasterises public/icons/icon.svg into the PNG sizes the manifest and iOS need.
 *
 *   node scripts/generate-icons.mjs
 *
 * Uses the Playwright Chromium we already install for the smoke suite, so there is no image
 * toolchain to install. Re-run whenever the mark changes (it is a placeholder until phase-10).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const svg = readFileSync(resolve(root, 'public/icons/icon.svg'), 'utf8');

/** Maskable icons need the mark inside the 80% safe zone, so it gets padded and a full bleed. */
const OUTPUTS = [
  { file: 'icon-192.png', size: 192, padding: 0, background: 'transparent' },
  { file: 'icon-512.png', size: 512, padding: 0, background: 'transparent' },
  { file: 'maskable-512.png', size: 512, padding: 0.1, background: '#FCFBF8' },
  { file: 'apple-touch-icon.png', size: 180, padding: 0, background: '#FCFBF8' },
];

const browser = await chromium.launch();

for (const { file, size, padding, background } of OUTPUTS) {
  const inset = Math.round(size * padding);
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<!doctype html><style>
       html,body{margin:0;padding:0;width:${size}px;height:${size}px;background:${background}}
       svg{position:absolute;inset:${inset}px;width:${size - inset * 2}px;height:${size - inset * 2}px}
     </style>${svg}`,
  );
  const buffer = await page.screenshot({ omitBackground: background === 'transparent' });
  writeFileSync(resolve(root, 'public/icons', file), buffer);
  console.log(`✓ public/icons/${file} (${size}×${size})`);
  await page.close();
}

await browser.close();
