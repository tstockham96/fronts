// End-to-end verification: plays FRONTS in headless Chrome at 390x844 and saves screenshots.
// Usage: node scripts/play.mjs [path-to-html]   (default: dist-single/fronts.html)
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const file = resolve(process.argv[2] ?? 'dist-single/fronts.html');
const url = pathToFileURL(file).href;
const shots = resolve('shots');
mkdirSync(resolve(shots, 'extra'), { recursive: true });
const exe = process.env.CHROME_PATH ?? ['/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => existsSync(p));

const browser = await chromium.launch({ executablePath: exe, headless: true });
const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const errors = [];
const log = (...a) => console.log('•', ...a);
const assert = (c, msg) => {
  if (!c) throw new Error('ASSERT: ' + msg);
  log('ok -', msg);
};

async function newPage(ctx, name) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${name}] pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${name}] console: ${m.text()}`));
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith('file:') && !u.startsWith('data:') && !u.startsWith('blob:')) errors.push(`[${name}] external request: ${u}`);
  });
  return page;
}

async function setArmy(page, target) {
  // Use the real controls: tap −/+ steppers (lower first so troops are free to add).
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < 5; i++) {
      const cur = Number(await page.locator(`[data-testid=troops-${i}]`).evaluate((e) => e.firstChild.textContent));
      const diff = target[i] - cur;
      if ((pass === 0 && diff < 0) || (pass === 1 && diff > 0)) {
        const row = page.locator('.front-row').nth(i);
        const btn = row.locator('.step').nth(diff < 0 ? 0 : 1);
        for (let k = 0; k < Math.abs(diff); k++) await btn.tap();
      }
    }
  }
}

// ---------------- Player A: ranked play ----------------
const ctxA = await browser.newContext(mobile);
const A = await newPage(ctxA, 'A');
await A.goto(url);
await A.waitForSelector('[data-testid=deploy]');
const twist = await A.locator('[data-testid=twist] b').textContent();
log('Twist today:', twist);
assert((await A.locator('[data-testid=deploy]').textContent()).toLowerCase().includes('deploy'), 'DEPLOY is ready on first load (preset 20s)');
const vals = await A.locator('.fr-val').allTextContents();
log('Front values:', vals.join(' '));

// Drag test on a track: drag the first front to ~0 then rebuild via steppers.
const track0 = A.locator('.track').nth(0);
const bb = await track0.boundingBox();
await A.mouse.move(bb.x + bb.width * 0.2, bb.y + bb.height / 2);
await A.mouse.down();
await A.mouse.move(bb.x + 2, bb.y + bb.height / 2, { steps: 5 });
await A.mouse.up();
const afterDrag = Number(await A.locator('[data-testid=troops-0]').evaluate((e) => e.firstChild.textContent));
assert(afterDrag <= 2, `slider drag works (front 0 now ${afterDrag})`);
const leftTxt = await A.locator('.troops-left b').textContent();
assert(Number(leftTxt) === 20 - afterDrag, `troops-left counter live (${leftTxt})`);

// Build a sensible army by star value: index by value.
const values = vals.map((v) => Number(v.replace('★', '')) || 3);
const byValue = { 1: 4, 2: 14, 3: 22, 4: 27, 5: 33 };
let army = values.map((v) => byValue[v] ?? 20);
const sum = army.reduce((a, b) => a + b, 0);
army[values.indexOf(Math.max(...values))] += 100 - sum;
await setArmy(A, army);
const shown = [];
for (let i = 0; i < 5; i++) shown.push(Number(await A.locator(`[data-testid=troops-${i}]`).evaluate((e) => e.firstChild.textContent)));
log('Army set to', shown.join('/'));
assert(Number(await A.locator('.troops-left b').textContent()) === 0, 'all 100 troops placed');
await A.waitForTimeout(250);
await A.screenshot({ path: `${shots}/01-deploy.png` });

await A.locator('[data-testid=deploy]').tap();
await A.waitForSelector('[data-testid=battle]');
await A.waitForTimeout(1900);
await A.screenshot({ path: `${shots}/extra/02a-battle-mid.png` });
await A.waitForSelector('.battle-cta.in', { timeout: 6000 });
await A.waitForTimeout(400);
await A.screenshot({ path: `${shots}/02-battle.png` });
const stamp = await A.locator('.stamp span').textContent();
log('Battle verdict vs random rival:', stamp);
await A.locator('[data-testid=battle-continue]').tap();
await A.waitForSelector('[data-testid=results]');
await A.waitForTimeout(1500);
await A.screenshot({ path: `${shots}/03-results.png` });
await A.screenshot({ path: `${shots}/extra/03b-results-full.png`, fullPage: true });
const pct = await A.locator('[data-testid=pct]').textContent();
log('Score:', pct);
await A.waitForFunction(() => !document.body.innerText.includes('scouting…'), null, { timeout: 8000 });
log('Hint:', await A.locator('.hint').textContent());
log('Best in hindsight:', (await A.locator('.army-line.hl .chip').allTextContents()).join(' | '));

await A.locator('[data-testid=copy]').tap();
await A.waitForTimeout(300);
const share = await A.evaluate(() => window.__lastShare);
console.log('\n----- SHARE TEXT -----\n' + share + '\n----------------------\n');
assert(/^FRONTS #\d+ ⚔️ /.test(share), 'share line 1');
assert(/Beat \d+% of generals/.test(share), 'share line 2');
assert((share.split('\n')[2].match(/[🟩🟨🟥]/gu) || []).length === 5, 'five colored squares');
assert(share.includes('#d='), 'share contains duel link');
assert(!share.split('\n').slice(0, 3).join(' ').replace(/★\d/g, '').replace(/#\d+/, '').replace(/Beat \d+%/, '').match(/\d/), 'no troop counts in share text');
const toast = await A.locator('[data-testid=toast]').textContent().catch(() => '');
log('Toast:', toast);

// Challenge a friend
await A.locator('[data-testid=challenge]').tap();
await A.locator('[data-testid=name-input]').fill('Thomas');
await A.locator('[data-testid=challenge-copy]').tap();
await A.waitForTimeout(300);
const challenge = await A.evaluate(() => window.__lastShare);
const link = challenge.match(/👉 (\S+)/)[1];
log('Duel link:', link.slice(0, 90) + '…');
assert(!/[?&#]d=.*(Thomas)/.test(link), 'duel link obfuscated (no plain name)');

const eventsBeforeReload = await A.evaluate(() => window.__frontsEvents.map((e) => e.name));
log('Analytics events so far (A):', [...new Set(eventsBeforeReload)].join(', '));
for (const e of ['play_started', 'deployed', 'shared', 'duel_created']) assert(eventsBeforeReload.includes(e), `analytics event fired: ${e}`);
// One ranked play per day: reload => results, not deploy
await A.reload();
await A.waitForSelector('[data-testid=results]');
assert((await A.locator('[data-testid=deploy]').count()) === 0, 'reload shows results (one ranked play per day)');

// War Room upsell
await A.locator('[data-testid=warroom-teaser]').scrollIntoViewIfNeeded();
await A.locator('[data-testid=warroom-teaser]').tap();
await A.waitForSelector('[data-testid=warroom]');
await A.waitForTimeout(350);
await A.screenshot({ path: `${shots}/extra/05-warroom.png` });
await A.locator('[data-testid=warroom-cta]').tap();
await A.locator('[data-testid=warroom] .icon-btn').tap();

// Stats
await A.locator('[data-testid=stats-btn]').tap();
await A.waitForSelector('[data-testid=stats]');
await A.waitForTimeout(350);
await A.screenshot({ path: `${shots}/extra/06-stats.png` });
log('Stats:', (await A.locator('.stat-grid').innerText()).replace(/\n/g, ' '));
await A.locator('[data-testid=stats] .icon-btn').tap();

// ---------------- Player B: opens the duel link ----------------
const ctxB = await browser.newContext(mobile);
const B = await newPage(ctxB, 'B');
await B.goto(link);
await B.waitForSelector('[data-testid=duel-banner]');
log('Duel banner:', (await B.locator('[data-testid=duel-banner]').innerText()).replace(/\n/g, ' / '));
assert(!(await B.content()).includes(shown.join('/')), "challenger's army is not visible before committing");
await B.screenshot({ path: `${shots}/extra/04a-duel-deploy.png` });
const bVals = (await B.locator('.fr-val').allTextContents()).map((v) => Number(v.replace('★', '')) || 3);
const bArmy = bVals.map((v) => ({ 1: 0, 2: 21, 3: 26, 4: 26, 5: 27 })[v] ?? 20);
bArmy[bVals.indexOf(Math.max(...bVals))] += 100 - bArmy.reduce((a, b) => a + b, 0);
await setArmy(B, bArmy);
await B.locator('[data-testid=deploy]').tap();
await B.waitForSelector('[data-testid=battle]');
await B.waitForSelector('.battle-cta.in', { timeout: 6000 });
await B.locator('[data-testid=battle-continue]').tap();
await B.waitForSelector('[data-testid=duel-result]');
await B.waitForTimeout(500);
await B.screenshot({ path: `${shots}/04-duel.png` });
await B.screenshot({ path: `${shots}/extra/04b-duel-full.png`, fullPage: true });
const rec = (await B.locator('[data-testid=duel-record]').textContent()).replace(/\s+/g, ' ');
log('Duel record:', rec);
assert(/You & Thomas: \d–\d/i.test(rec), 'duel record shows "You & Thomas: W–L"');
const h2hYou = await B.locator('.h2h-n.you').allTextContents();
const h2hFoe = await B.locator('.h2h-n.foe').allTextContents();
log('H2H you:', h2hYou.join('/'), ' them:', h2hFoe.join('/'));
assert(h2hFoe.map((x) => parseInt(x)).join('/') === shown.join('/'), "after committing, challenger's real army is revealed");
await B.locator('[data-testid=send-back]').tap();
await B.locator('[data-testid=name-input]').fill('Maya');
await B.locator('[data-testid=challenge-copy]').tap();
await B.waitForTimeout(250);
const back = await B.evaluate(() => window.__lastShare);
console.log('\n----- REMATCH TEXT -----\n' + back + '\n------------------------\n');
const backLink = back.match(/👉 (\S+)/)[1];
const evB = await B.evaluate(() => window.__frontsEvents.map((e) => e.name));
log('Analytics events (B):', [...new Set(evB)].join(', '));
assert(evB.includes('duel_completed'), 'analytics event fired: duel_completed');
// Reopening the same duel link doesn't allow a re-roll
await B.goto(link);
await B.reload();
await B.waitForSelector('[data-testid=duel-result]');
assert(true, 'reopening a finished duel shows the result (no re-roll)');

// Thomas (A) receives Maya's rematch link
await A.goto(backLink);
await A.waitForSelector('[data-testid=duel-banner]');
log('Rematch banner for A:', (await A.locator('[data-testid=duel-banner] b').textContent()));
await A.locator('[data-testid=deploy]').tap();
await A.waitForSelector('[data-testid=battle]');
await A.locator('[data-testid=battle]').tap(); // tap to skip
await A.waitForSelector('.battle-cta.in', { timeout: 3000 });
await A.locator('[data-testid=battle-continue]').tap();
await A.waitForSelector('[data-testid=duel-result]');
log('A record:', await A.locator('[data-testid=duel-record]').innerText());
await A.locator('[data-testid=to-daily]').tap();
await A.waitForSelector('[data-testid=results]');

// ---------------- Practice mode ----------------
await A.locator('[data-testid=practice]').scrollIntoViewIfNeeded();
await A.locator('[data-testid=practice]').tap();
await A.waitForSelector('.mode-banner.practice');
log('Practice twist:', await A.locator('[data-testid=twist] b').textContent());
await A.screenshot({ path: `${shots}/extra/07-practice-deploy.png` });
for (let round = 0; round < 3; round++) {
  if (round > 0) {
    await A.locator('[data-testid=practice-again]').tap();
    await A.waitForSelector('.mode-banner.practice');
  }
  const pv = (await A.locator('.fr-val').allTextContents()).map((v) => Number(v.replace('★', '')) || 3);
  const pa = round === 0 ? [20, 20, 20, 20, 20] : pv.map((v) => ({ 1: 0, 2: 10 + round, 3: 25, 4: 30 - round, 5: 35 })[v] ?? 20);
  pa[pv.indexOf(Math.max(...pv))] += 100 - pa.reduce((a, b) => a + b, 0);
  await setArmy(A, pa);
  await A.locator('[data-testid=deploy]').tap();
  await A.waitForSelector('[data-testid=battle]');
  await A.locator('[data-testid=battle]').tap();
  await A.locator('[data-testid=battle-continue]').tap();
  await A.waitForSelector('[data-testid=results]');
  await A.waitForTimeout(1300);
  log(`Practice round ${round + 1}: army ${pa.join('/')} → beat ${await A.locator('[data-testid=pct]').textContent()} of yesterday's crowd`);
}
await A.waitForTimeout(1300);
await A.screenshot({ path: `${shots}/extra/08-practice-results.png` });

// ---------------- Desktop sanity ----------------
const ctxD = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const D = await newPage(ctxD, 'D');
await D.goto(url);
await D.waitForSelector('[data-testid=deploy]');
await D.waitForTimeout(600);
await D.screenshot({ path: `${shots}/extra/09-desktop-deploy.png` });
const ctx375 = await browser.newContext({ ...mobile, viewport: { width: 375, height: 667 } });
const S = await newPage(ctx375, 'S');
await S.goto(url);
await S.waitForSelector('[data-testid=deploy]');
await S.waitForTimeout(600);
await S.screenshot({ path: `${shots}/extra/10-iphone-se-deploy.png` });
const overflow = await S.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
assert(!overflow, 'no horizontal overflow at 375px');

const events = await A.evaluate(() => window.__frontsEvents.map((e) => e.name));
log('Analytics events (A):', [...new Set(events)].join(', '));

await browser.close();
if (errors.length) {
  console.log('\nERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('\nALL CHECKS PASSED');
