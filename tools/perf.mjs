// Frame rate during a race with CPU throttled (approximates a mid-range Android).
// Usage: node tools/perf.mjs [throttle=4]
import { chromium } from 'playwright';
const rate = Number(process.argv[2] ?? 4);
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto('http://127.0.0.1:5173/race.html?user=alice&autopilot=1');
await page.getByRole('button', { name: 'Start the race' }).click({ timeout: 20000 });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate });
await page.waitForTimeout(5000);
const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 4000) requestAnimationFrame(f); else res(Math.round((n * 1000) / (performance.now() - t0))); }; requestAnimationFrame(f); }));
console.log(`fps at ${rate}x CPU throttle, dpr 2:`, fps);
await browser.close();
