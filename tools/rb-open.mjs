// Reload the playtest post in the CDP browser, open the race, and screenshot the start card.
import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:9333');
const p = b.contexts()[0].pages().find((x) => x.url().includes('/comments/'));
const errs = [];
p.on('console', (m) => m.type() === 'error' && !/reddit\.com\/svc|preload/.test(m.text()) && errs.push(m.text().slice(0, 200)));
await p.bringToFront();
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(9000);
await p.screenshot({ path: '.mandaadi/r-splash.png' });
const sf = p.frames().find((f) => f.url().includes('splash.html'));
console.log('splash sub:', sf ? await sf.locator('#sub').textContent() : 'no splash frame');
if (sf) await sf.getByRole('button').first().click();
let f;
for (let i = 0; i < 30 && !f; i++) { f = p.frames().find((x) => x.url().includes('race.html')); if (!f) await p.waitForTimeout(500); }
await p.waitForTimeout(9000);
if (f && (await f.getByRole('button', { name: /^Skip$/ }).count())) { await f.getByRole('button', { name: /^Skip$/ }).click(); await p.waitForTimeout(1500); }
await p.screenshot({ path: '.mandaadi/r-start.png' });
console.log('daily:', f ? await f.locator('.daily').textContent().catch(() => 'none') : 'no race frame');
console.log('errors:', errs.join('\n') || 'none');
await b.close();
