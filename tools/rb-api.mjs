// Exercise the ranked-race API on Reddit from inside the race webview (CDP browser).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const log = readFileSync(process.argv[2], 'utf8').trim();
const b = await chromium.connectOverCDP('http://127.0.0.1:9333');
const p = b.contexts()[0].pages().find((x) => x.url().includes('/comments/'));
let f;
for (let i = 0; i < 30 && !f; i++) { f = p.frames().find((x) => x.url().includes('race.html')); if (!f) await p.waitForTimeout(500); }
const call = (method, path, body) => f.evaluate(async ([m, u, bd]) => { const r = await fetch(u, { method: m, headers: bd ? { 'content-type': 'application/json' } : {}, ...(bd ? { body: JSON.stringify(bd) } : {}) }); return r.status + ' ' + (await r.text()); }, [method, path, body]);
const today = JSON.parse((await call('GET', '/api/today')).slice(4));
console.log('today', today.date, today.course.id, JSON.stringify(today.attempts));
const st = await call('POST', '/api/race/start', { date: today.date, courseId: today.course.id });
console.log('start', st.slice(0, 200));
const token = JSON.parse(st.slice(4)).token;
await p.waitForTimeout(80000);
console.log('finish', (await call('POST', '/api/race/finish', { token, log, livery: { hull: '#1d7a5c', band: '#f1c232', sailNo: '27' } })).slice(0, 300));
console.log('board', (await call('GET', '/api/board')).slice(0, 300));
console.log('ghosts', (await call('GET', '/api/ghosts')).slice(0, 120));
console.log('routes', (await call('GET', '/api/routes')).slice(0, 120));
const img = await f.evaluate(() => { const c = document.createElement('canvas'); c.width = 270; c.height = 338; const g = c.getContext('2d'); g.fillStyle = '#0b3f5c'; g.fillRect(0, 0, 270, 338); g.fillStyle = '#ff6b1a'; g.fillRect(0, 300, 270, 38); return c.toDataURL('image/jpeg', 0.8); });
console.log('share', (await call('POST', '/api/share', { image: img })).slice(0, 300));
await b.close();
