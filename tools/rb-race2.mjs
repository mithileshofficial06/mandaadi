// In the open Reddit post's race webview: skip the guide, start, sail, screenshot; report errors and API calls.
import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:9333');
const p = b.contexts()[0].pages().find((x) => x.url().includes('/comments/'));
const errs = [];
const api = [];
p.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errs.push(m.text().slice(0, 200)));
p.on('response', (r) => r.url().includes('/api/') && api.push(`${r.status()} ${r.url().split('.net')[1]}`));
let f;
for (let i = 0; i < 20 && !f; i++) { f = p.frames().find((x) => x.url().includes('race.html')); if (!f) await p.waitForTimeout(500); }
console.log('frame', !!f, p.frames().map((x) => x.url().slice(0, 60)).join(', '));
const click = async (re) => { const l = f.getByRole('button', { name: re }); if (await l.count()) { await l.first().click(); return true; } return false; };
console.log('skip', await click(/^Skip$/));
await p.waitForTimeout(1500);
console.log('start', await click(/Start the race/i));
await p.waitForTimeout(9000);
await p.screenshot({ path: '.mandaadi/r-2.png' });
// steer a little: tack
await click(/^Tack$/i);
await p.waitForTimeout(8000);
await p.screenshot({ path: '.mandaadi/r-3.png' });
const fps = await f.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const tick = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res(Math.round(n / 2)); }; requestAnimationFrame(tick); }));
console.log('fps', fps);
console.log('api:', api.join(' | ') || 'none');
console.log('errors:', errs.join('\n') || 'none');
await b.close();
