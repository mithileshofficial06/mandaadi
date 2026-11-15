// Still views for art review: node tools/view.mjs out.png "x,y,yawDeg,halfWidth" [w] [h]
import { chromium } from 'playwright';
const [out, view, w = '390', h = '844'] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(`http://127.0.0.1:5173/race.html?user=alice&view=${view}`);
await page.waitForTimeout(2600);
await page.evaluate(() => document.querySelector('.hud')?.remove());
await page.screenshot({ path: out });
await browser.close();
