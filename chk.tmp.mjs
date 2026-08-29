import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
const errs = [];
p.on('console', (m) => {
  if (m.type() === 'error') errs.push(m.text().slice(0, 300));
});
p.on('pageerror', (e) => errs.push('PAGEERROR ' + String(e).slice(0, 300)));
await p.goto('http://localhost:3000/dev/note/print', { waitUntil: 'networkidle' });
await p.waitForTimeout(12000);
console.log('pagedjs_page count:', await p.locator('.pagedjs_page').count());
console.log('katex count:', await p.locator('.katex').count());
console.log('errors:', errs.slice(0, 4));
await b.close();
