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
const time = await page.locator('.finish__time').textContent().catch(() => null);
console.log('finish time', time, 'errors', errors.length ? errors : 'none');
await browser.close();
if (!time) process.exit(1);
