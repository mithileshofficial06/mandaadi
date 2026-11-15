// Screenshots of the race in the local harness (GPU Chromium, phone size, 1x scale).
// Usage: node tools/shoot.mjs [outDir] [baseUrl] [width] [height]   (npm run harness must be running)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? '.mandaadi/shots';
const base = process.argv[3] ?? 'http://127.0.0.1:5173';
const W = Number(process.argv[4] ?? 390);
const H = Number(process.argv[5] ?? 844);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: false });
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log('console:', m.type(), m.text()));
page.on('pageerror', (e) => console.log('pageerror:', e.message));

await page.goto(`${base}/splash.html?user=alice`);
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/0-splash.png` });

await page.goto(`${base}/race.html?user=alice`);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/1a-guide.png` });
await page.getByRole('button', { name: 'Next' }).click();
await page.waitForTimeout(1800);
await page.screenshot({ path: `${out}/1b-guide2.png` });
await page.getByRole('button', { name: 'Next' }).click();
await page.getByRole('button', { name: 'Got it' }).click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/1-start.png` });

await page.getByRole('button', { name: 'Start the race' }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/2-countdown.png` });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/3-racing.png` });

// Steer right (drag) into the wind to show the cone.
const drag = async (dx, ms) => {
  await page.mouse.move(W / 2, H * 0.6);
  await page.mouse.down();
  const steps = 10;
  for (let i = 1; i <= steps; i++) await page.mouse.move(W / 2 + (dx * i) / steps, H * 0.6);
  await page.waitForTimeout(ms);
  await page.mouse.up();
};
await drag(70, 700);
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/4-cone.png` });

// Bear away and sail on.
await drag(-70, 900);
await page.waitForTimeout(5000);
await page.screenshot({ path: `${out}/5-sailing.png` });

await page.keyboard.press('Space');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/6-tack.png` });

await page.locator('#minimap').click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/7-map.png` });

const fps = await page.evaluate(
  () =>
    new Promise((res) => {
      let n = 0;
      const t0 = performance.now();
      const f = () => {
        n++;
        if (performance.now() - t0 < 2000) requestAnimationFrame(f);
        else res(Math.round((n * 1000) / (performance.now() - t0)));
      };
      requestAnimationFrame(f);
    })
);
console.log('fps', fps);
await browser.close();
