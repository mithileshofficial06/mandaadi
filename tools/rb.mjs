// Drive the Reddit-logged-in Chromium (.mandaadi/reddit-profile, started with --remote-debugging-port=9333)
// over CDP, so it stays a normal browser that Reddit does not block.
// Usage: node tools/rb.mjs <url> [shot.png] [clickText]   opens url in a tab, optionally clicks a button, screenshots.
import { chromium } from 'playwright';

const [url, shot = '.mandaadi/rb.png', click] = process.argv.slice(2);
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
if (click) {
  await page.getByRole('button', { name: new RegExp(click, 'i') }).first().click();
  await page.waitForTimeout(4000);
}
await page.screenshot({ path: shot });
console.log('url:', page.url());
console.log((await page.innerText('body')).replace(/\s+/g, ' ').slice(0, 700));
if (!process.env.KEEP) await page.close();
await browser.close();
