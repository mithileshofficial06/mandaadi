// Inline feed view. Tiny: no three.js, no Preact. Taps only, no scroll traps.
// Draws today's course as a sailing chart: depth shading, islands, the mark, the line and the wind.
import './styles/tokens.css';
import './splash.css';
import { requestExpandedMode } from '@devvit/web/client';
import type { RoutesResponse, TodayResponse } from '../shared/api/types';
import type { Course } from '../shared/core/course';
import { SANDBAR_SPRINT } from '../shared/content/courses';

const TYPE: Record<string, string> = { light: 'Light Air', windward: 'Windward-Leeward', shifty: 'Shifty', tide: 'Tide Race', storm: 'Storm', community: 'Community Course', cup: 'The Cup' };
const STRENGTH = ['light', 'medium', 'strong'];
const cv = document.getElementById('chart') as HTMLCanvasElement;

function draw(course: Course): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = cv.clientWidth;
  const h = cv.clientHeight;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const g = cv.getContext('2d')!;
  g.scale(dpr, dpr);
  // map course metres to the canvas, north up, fit the 400 m box with a margin
  const s = Math.min(w, h * 1.4) / 330;
  const ox = w / 2 - 200 * s;
  const oy = h * 0.55 + 145 * s;
  const X = (x: number) => ox + x * s;
  const Y = (y: number) => oy - y * s;

  const sea = g.createLinearGradient(0, 0, 0, h);
  sea.addColorStop(0, '#0d5571');
  sea.addColorStop(1, '#0b3f5c');
  g.fillStyle = sea;
  g.fillRect(0, 0, w, h);
  // depth contours around islands
  for (const isl of course.islands) {
    for (const [pad, col] of [[26, 'rgba(47,179,176,0.18)'], [14, 'rgba(47,179,176,0.32)'], [6, 'rgba(120,214,200,0.55)']] as const) {
      g.fillStyle = col;
      for (const p of isl.parts) {
        g.beginPath();
        g.arc(X(p.x), Y(p.y), (p.r + pad) * s, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.fillStyle = '#e9d8ab';
    for (const p of isl.parts) {
      g.beginPath();
      g.arc(X(p.x), Y(p.y), p.r * s, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#7d8a48';
    for (const p of isl.parts) {
      g.beginPath();
      g.arc(X(p.x), Y(p.y), Math.max(0, p.r - 7) * s, 0, Math.PI * 2);
      g.fill();
    }
  }
  // gusts as darker water
  for (const p of course.puffs) {
    if (p.k <= 100) continue;
    const gr = g.createRadialGradient(X(p.x), Y(p.y), 0, X(p.x), Y(p.y), p.r * s);
    gr.addColorStop(0, 'rgba(4,28,40,0.42)');
    gr.addColorStop(1, 'rgba(4,28,40,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(X(p.x), Y(p.y), p.r * s, 0, Math.PI * 2);
    g.fill();
  }
  // The wake map: every sailor's verified route today, faint, so busy lines glow brighter.
  const line = (pts: Array<[number, number]>) => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(X(x / 10), Y(y / 10)) : g.moveTo(X(x / 10), Y(y / 10))));
    g.stroke();
  };
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.lineWidth = 1.6;
  g.strokeStyle = `rgba(244,241,234,${Math.max(0.08, Math.min(0.5, 2.2 / Math.sqrt(wakes.routes.length + 1)))})`;
  for (const r of wakes.routes) line(r);
  if (wakes.mine) {
    g.lineWidth = 2.6;
    g.strokeStyle = '#ff6b1a';
    line(wakes.mine);
  }
  // start/finish line
  g.strokeStyle = 'rgba(244,241,234,0.9)';
  g.setLineDash([5, 4]);
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(X(course.start.a.x), Y(course.start.a.y));
  g.lineTo(X(course.start.b.x), Y(course.start.b.y));
  g.stroke();
  g.setLineDash([]);
  // marks
  for (const m of course.marks) {
    g.fillStyle = '#ff6b1a';
    g.beginPath();
    g.arc(X(m.x), Y(m.y), 5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#fff';
    g.lineWidth = 1.5;
    g.stroke();
  }
  // wind arrow (top right)
  const a = (course.wind.from / 4096) * Math.PI * 2;
  const cx = w - 30;
  const cy = 30;
  g.save();
  g.translate(cx, cy);
  g.rotate(a + Math.PI);
  g.strokeStyle = '#f4f1ea';
  g.lineWidth = 2.4;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(0, -14);
  g.lineTo(0, 12);
  g.moveTo(-6, 5);
  g.lineTo(0, 13);
  g.lineTo(6, 5);
  g.stroke();
  g.restore();
}

let course: Course = SANDBAR_SPRINT;
let wakes: RoutesResponse = { routes: [], mine: null };
const redraw = () => draw(course);
window.addEventListener('resize', redraw);
redraw();

document.getElementById('race')!.addEventListener('click', (e) => requestExpandedMode(e, 'race'));

void fetch('/api/today')
  .then((r) => (r.ok ? (r.json() as Promise<TodayResponse>) : null))
  .then((t) => {
    if (!t) return;
    course = t.course;
    document.getElementById('kicker')!.textContent = `Day ${t.day} · ${TYPE[t.course.type] ?? 'Race'} · ${STRENGTH[t.course.wind.strength]} breeze`;
    document.getElementById('title')!.textContent = t.course.name;
    const fmt = (ticks: number) => {
      const s = ticks / 30;
      const m = Math.floor(s / 60);
      return `${m}:${s - m * 60 < 10 ? '0' : ''}${(s - m * 60).toFixed(1)}`;
    };
    const sub = document.getElementById('sub')!;
    const cta = document.getElementById('race')!;
    const left = t.attempts.max - t.attempts.used;
    if (!t.live) {
      sub.textContent = t.top ? `Closed · won by u/${t.top.name} in ${fmt(t.top.ticks)} · ${t.sailors} sailors` : 'This race day has closed.';
      cta.textContent = 'Practise this course';
    } else if (t.best) {
      sub.textContent = `Your best ${fmt(t.best.ticks)} · ${t.best.rank} of ${t.sailors}${t.top && t.best.rank > 1 ? ` · leader u/${t.top.name} ${fmt(t.top.ticks)}` : ''}`;
      cta.textContent = left > 0 ? `Beat your time (${left} left)` : 'Practise the course';
    } else if (t.top) {
      sub.textContent = `${t.sailors} ${t.sailors === 1 ? 'sailor' : 'sailors'} today · fastest u/${t.top.name} ${fmt(t.top.ticks)}. Find a faster line.`;
    }
    redraw();
  })
  .catch(() => undefined);

void fetch('/api/routes')
  .then((r) => (r.ok ? (r.json() as Promise<RoutesResponse>) : null))
  .then((w) => {
    if (!w) return;
    wakes = w;
    redraw();
  })
  .catch(() => undefined);
