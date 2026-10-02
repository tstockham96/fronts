// E2E in backend mode: needs `node scripts/local-api.mjs 8787` running.
import { chromium } from 'playwright-core';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const api = process.env.API ?? 'http://localhost:8787';
const url = pathToFileURL(resolve('dist-single/fronts.html')).href;
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const mk = async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript((a) => (window.FRONTS_CONFIG = { apiUrl: a }), api);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  return p;
};
const A = await mk();
await A.goto(url);
await A.locator('[data-testid=deploy]').tap();
await A.waitForSelector('.battle-cta.in');
await A.locator('[data-testid=battle-continue]').tap();
await A.waitForSelector('[data-testid=results]');
console.log('A live line:', await A.locator('.hero-live').innerText());
await A.locator('[data-testid=challenge]').tap();
await A.locator('[data-testid=name-input]').fill('Thomas');
await A.waitForTimeout(1200); // server duel is pre-created (debounced)
await A.locator('[data-testid=challenge-copy]').tap();
const link = (await A.evaluate(() => window.__lastShare)).match(/👉 (\S+)/)[1];
console.log('Server duel link:', link.replace(/^.*#/, '#'));
if (!link.includes('#s=')) throw new Error('expected a server-stored duel link');
const B = await mk();
await B.goto(link);
await B.waitForSelector('[data-testid=duel-banner]');
console.log('B banner:', (await B.locator('[data-testid=duel-banner] b').textContent()));
await B.locator('[data-testid=deploy]').tap();
await B.waitForSelector('.battle-cta.in');
await B.locator('[data-testid=battle-continue]').tap();
await B.waitForSelector('[data-testid=duel-result]');
console.log('B record:', (await B.locator('[data-testid=duel-record]').textContent()).replace(/\s+/g, ' '));
await browser.close();
console.log('API MODE OK');
