// Open the race from the splash inside the Reddit post (CDP browser) and screenshot it.
import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:9333');
const p = b.contexts()[0].pages().find((x) => x.url().includes('/comments/'));
const errs = [];
p.on('console', (m) => (m.type() === 'error') && errs.push(m.text().slice(0, 200)));
p.on('pageerror', (e) => errs.push('pageerror ' + e.message.slice(0, 200)));
const step = async (name, ms) => { await p.waitForTimeout(ms); await p.screenshot({ path: `.mandaadi/r-${name}.png` }); };
for (const f of p.frames()) {
  const btn = f.getByRole('button', { name: /Race today/i });
  if (await btn.count()) { await btn.first().click(); console.log('clicked in', f.url().slice(0, 80)); break; }
}
await step('1', 12000);
console.log('frames:', p.frames().map((f) => f.url().slice(0, 90)).join('\n'));
console.log('errors:', errs.join('\n') || 'none');
await b.close();
