// Screenshots every twist (days #1..#7) by faking the clock. Usage: node scripts/twists-gallery.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const url = pathToFileURL(resolve('dist-single/fronts.html')).href;
const out = resolve('shots/extra/twists');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const errors = [];
for (let day = 1; day <= 7; day++) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.clock.setFixedTime(new Date(2026, 9, 1 + day, 18, 30));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`day ${day}: ${e.message}`));
  await page.goto(url);
  await page.waitForSelector('[data-testid=deploy]');
  const twist = (await page.locator('[data-testid=twist] b').textContent()).trim();
  // a 30/30/30/10/0-ish army by position to exercise reinforce / chains
  const target = [30, 30, 30, 10, 0];
  for (let i = 4; i >= 0; i--) {
    const cur = Number(await page.locator(`[data-testid=troops-${i}]`).evaluate((e) => e.firstChild.textContent));
    const btn = page.locator('.front-row').nth(i).locator('.step').nth(0);
    for (let k = 0; k < cur - target[i]; k++) await btn.tap();
  }
  for (let i = 0; i < 5; i++) {
    const cur = Number(await page.locator(`[data-testid=troops-${i}]`).evaluate((e) => e.firstChild.textContent));
    const btn = page.locator('.front-row').nth(i).locator('.step').nth(1);
    for (let k = 0; k < target[i] - cur; k++) await btn.tap();
  }
  await page.waitForTimeout(500);
  const slug = `${day}-${twist.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  await page.screenshot({ path: `${out}/${slug}-deploy.png` });
  await page.locator('[data-testid=deploy]').tap();
  await page.waitForSelector('.battle-cta.in', { timeout: 8000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${slug}-battle.png` });
  await page.locator('[data-testid=battle-continue]').tap();
  await page.waitForSelector('[data-testid=results]');
  await page.waitForFunction(() => !document.body.innerText.includes('scouting…'));
  await page.waitForTimeout(1300);
  const pct = await page.locator('[data-testid=pct]').textContent();
  const hint = await page.locator('.hint').textContent();
  const badge = await page.locator('.badge-name').textContent();
  console.log(`#${day} ${twist.padEnd(15)} beat ${pct.padEnd(4)} ${badge.padEnd(10)} ${hint}`);
  await page.screenshot({ path: `${out}/${slug}-results.png`, fullPage: true });
  await ctx.close();
}
await browser.close();
if (errors.length) { console.log(errors.join('\n')); process.exit(1); }
