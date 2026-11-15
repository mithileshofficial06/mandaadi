// Phone test on Reddit's mobile web: 390x844 touch device in the CDP browser. Opens the post,
// taps into the race, starts it, drags to steer with touch events, taps TACK; reports fps and errors.
import { chromium } from 'playwright';
const url = process.argv[2];
const b = await chromium.connectOverCDP('http://127.0.0.1:9333');
const ctx = b.contexts()[0];
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await cdp.send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' });
const errs = [];
p.on('console', (m) => m.type() === 'error' && !/reddit\.com|preload|recaptcha|Failed to load resource/.test(m.text()) && errs.push(m.text().slice(0, 160)));
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(10000);
await p.screenshot({ path: '.mandaadi/m-1-post.png' });
const tapEl = async (loc) => {
  const bb = await loc.boundingBox();
  if (!bb) return false;
  const pt = [{ x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  return true;
};
const findFrame = async (name) => { for (let i = 0; i < 40; i++) { const f = p.frames().find((x) => x.url().includes(name)); if (f) return f; await p.waitForTimeout(500); } return null; };
const sf = await findFrame('splash.html');
if (sf) await sf.locator('#race').click();
const f = await findFrame('race.html');
await p.waitForTimeout(9000);
await p.screenshot({ path: '.mandaadi/m-2-open.png' });
if (!f) { console.log('no race frame'); process.exit(1); }
for (const re of [/^Skip$/, /Start the race|Start practice/]) { const l = f.getByRole('button', { name: re }); if (await l.count()) { await tapEl(l.first()); await p.waitForTimeout(1500); } }
await p.waitForTimeout(6000);
// touch drag on the water: steer right for 1.5 s, then let go
const box = await (await f.frameElement()).boundingBox();
const x0 = box.x + box.width / 2;
const y0 = box.y + box.height * 0.55;
const touch = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: y0 }] });
await touch('touchStart', x0);
for (let i = 1; i <= 10; i++) { await touch('touchMove', x0 + i * 8); await p.waitForTimeout(40); }
await p.waitForTimeout(1500);
await p.screenshot({ path: '.mandaadi/m-3-steer.png' });
const steer = await f.evaluate(() => document.querySelector('.steer, [class*=steer]')?.getAttribute('style') ?? '');
await touch('touchEnd', x0);
const tack = f.getByRole('button', { name: /^Tack$/i });
if (await tack.count()) await tapEl(tack.first());
await p.waitForTimeout(5000);
await p.screenshot({ path: '.mandaadi/m-4-tack.png' });
const fps = await f.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const tick = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else res(Math.round(n / 3)); }; requestAnimationFrame(tick); }));
const hudTxt = await f.locator('.hud').first().innerText().catch(() => '');
console.log('fps', fps, '| steer style', steer.slice(0, 60), '| hud', hudTxt.replace(/\s+/g, ' ').slice(0, 160));
console.log('errors:', errs.join('\n') || 'none');
await p.close();
await b.close();
