// End-to-end: the autopilot sails a full race in the real client; screenshots at key moments.
// Usage: node tools/e2e.mjs [outDir]   (npm run harness must be running)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] ?? '.mandaadi/e2e';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://127.0.0.1:5173/race.html?user=alice&autopilot=1');
await page.getByRole('button', { name: 'Start the race' }).click({ timeout: 15000 });
const t0 = Date.now();
let n = 0;
const shots = [8, 30, 52, 62, 75];
while (Date.now() - t0 < 140000) {
  const done = await page.locator('.finish').count();
  const el = (Date.now() - t0) / 1000;
  if (shots[n] !== undefined && el >= shots[n]) await page.screenshot({ path: `${out}/t${String(shots[n++]).padStart(3, '0')}.png` });
  if (done) break;
  await page.waitForTimeout(500);
}
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/finish.png` });
const time = await page.locator('.finish__time').getAttribute('aria-label').catch(() => null);
// The server re-sails the run and returns the official verdict and today's board.
await page.waitForFunction(() => { const v = document.querySelector('.verdict'); return v && !/Checking/.test(v.textContent ?? ''); }, null, { timeout: 15000 }).catch(() => null);
const verdict = await page.locator('.verdict').first().textContent().catch(() => null);
const board = await page.locator('.fleet--board li').count();
await page.screenshot({ path: `${out}/finish.png` });
console.log('finish time', time, '| verdict', verdict, '| board rows', board, '| errors', errors.length ? errors : 'none');
await browser.close();
if (!time) process.exit(1);

// Replay: re-sail the same race at 3x and come back to the finish card.
{
  const b2 = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const p2 = await b2.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  p2.on('pageerror', (e) => errs.push(e.message));
  await p2.goto('http://127.0.0.1:5173/race.html?user=alice&autopilot=1');
  await p2.getByRole('button', { name: 'Start the race' }).click({ timeout: 15000 });
  await p2.locator('.finish').waitFor({ timeout: 140000 });
  await p2.getByRole('button', { name: 'Watch replay' }).click();
  await p2.waitForTimeout(12000);
  await p2.screenshot({ path: `${out}/replay.png` });
  await p2.locator('.finish').waitFor({ timeout: 60000 });
  console.log('replay ok, errors', errs.length ? errs : 'none');
  await b2.close();
}
