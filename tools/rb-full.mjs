// Full races through the real UI on the playtest subreddit, sailed by the dev-only autopilot:
// today's ranked race, then School level 1-1. Reports the verdicts, the board and errors.
import { chromium } from 'playwright';
const url = process.argv[2];
const b = await chromium.connectOverCDP('http://127.0.0.1:9333');
const ctx = b.contexts()[0];
const p = await ctx.newPage();
const errs = [];
p.on('console', (m) => m.type() === 'error' && !/reddit\.com|preload|recaptcha|Failed to load resource/.test(m.text()) && errs.push(m.text().slice(0, 160)));
const frame = async (name) => { for (let i = 0; i < 60; i++) { const f = p.frames().find((x) => x.url().includes(name)); if (f) return f; await p.waitForTimeout(500); } return null; };
const open = async () => {
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(9000);
  const sf = await frame('splash');
  await sf.locator('#race').click();
  const f = await frame('race.html');
  await p.waitForTimeout(8000);
  const skip = f.getByRole('button', { name: /^Skip$/ });
  if (await skip.count()) { await skip.click(); await p.waitForTimeout(1000); }
  await p.screenshot({ path: '.mandaadi/full-home.png' });
  return f;
};
let f = await open();
await f.evaluate(() => localStorage.setItem('mandaadi.autopilot', '1'));
f = await open();
await f.locator('.homecard--today').click();
await p.waitForTimeout(1500);
console.log('start card:', (await f.locator('.daily').textContent().catch(() => '')).slice(0, 120));
await f.getByRole('button', { name: /Start the race/ }).click();
await f.locator('.finish').waitFor({ timeout: 200000 });
await f.waitForFunction(() => { const v = document.querySelector('.verdict'); return v && !/Checking/.test(v.textContent ?? ''); }, null, { timeout: 20000 }).catch(() => null);
await p.screenshot({ path: '.mandaadi/full-daily.png' });
console.log('daily time:', await f.locator('.finish__time').getAttribute('aria-label'), '| verdict:', await f.locator('.verdict').first().textContent(), '| board rows:', await f.locator('.fleet--board li').count());
// School level 1-1
f = await open();
await f.locator('.homecard--school').click();
await p.waitForTimeout(800);
await f.getByRole('button', { name: /Level 1-1/ }).click();
await p.waitForTimeout(3000);
await f.getByRole('button', { name: /Start level/ }).click();
await f.locator('.finish').waitFor({ timeout: 150000 });
await f.waitForFunction(() => !/Saving/.test(document.querySelector('.lvlres__note')?.textContent ?? 'Saving'), null, { timeout: 20000 }).catch(() => null);
await p.waitForTimeout(1500);
await p.screenshot({ path: '.mandaadi/full-school.png' });
console.log('school:', await f.locator('.finish__time').getAttribute('aria-label'), '|', await f.locator('.lvlres__stars').getAttribute('aria-label'), '|', await f.locator('.lvlres__note').textContent());
console.log('school api:', await f.evaluate(async () => (await (await fetch('/api/school')).text()).slice(0, 120)));
await f.evaluate(() => localStorage.removeItem('mandaadi.autopilot'));
console.log('errors:', errs.join('\n') || 'none');
await p.close();
await b.close();
