// 2D sailing chart of a course, used on the start card (with an animated example line) and the
// finish card (your line against the Harbourmaster's). Plain canvas, north up.
import type { Course } from '../../shared/core/course';

export type Route = Array<[number, number]>;

type ChartOpts = {
  routes?: Array<{ pts: Route; colour: string; width: number; dash?: number[]; progress?: number }>;
  /** Draw an example zigzag up to the first mark (start card). progress 0..1 animates it. */
  example?: number;
  pad?: number;
};

export function drawChart(cv: HTMLCanvasElement, course: Course, o: ChartOpts = {}): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = cv.clientWidth;
  const h = cv.clientHeight;
  if (!w || !h) return;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  }
  const g = cv.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  // Fit the marks, lines, islands and routes.
  const xs: number[] = [course.start.a.x, course.start.b.x, course.finish.a.x, course.finish.b.x, ...course.marks.map((m) => m.x)];
  const ys: number[] = [course.start.a.y, course.start.b.y, course.finish.a.y, course.finish.b.y, ...course.marks.map((m) => m.y)];
  for (const isl of course.islands) {
    for (const p of isl.parts) {
      xs.push(p.x - p.r, p.x + p.r);
      ys.push(p.y - p.r, p.y + p.r);
    }
  }
  for (const r of o.routes ?? []) {
    for (const [x, y] of r.pts) {
      xs.push(x);
      ys.push(y);
    }
  }
  const pad = o.pad ?? 14;
  const minX = Math.min(...xs) - 10;
  const maxX = Math.max(...xs) + 10;
  const minY = Math.min(...ys) - 10;
  const maxY = Math.max(...ys) + 10;
  const s = Math.min((w - pad * 2) / (maxX - minX), (h - pad * 2) / (maxY - minY));
  const ox = w / 2 - ((minX + maxX) / 2) * s;
  const oy = h / 2 + ((minY + maxY) / 2) * s;
  const X = (x: number) => ox + x * s;
  const Y = (y: number) => oy - y * s;

  // Sea
  const sea = g.createLinearGradient(0, 0, 0, h);
  sea.addColorStop(0, '#0f5f7c');
  sea.addColorStop(1, '#0b4562');
  g.fillStyle = sea;
  g.fillRect(0, 0, w, h);
  // faint chart grid
  g.strokeStyle = 'rgba(244,241,234,0.06)';
  g.lineWidth = 1;
  for (let gx = Math.floor(minX / 50) * 50; gx < maxX; gx += 50) {
    g.beginPath();
    g.moveTo(X(gx), 0);
    g.lineTo(X(gx), h);
    g.stroke();
  }
  for (let gy = Math.floor(minY / 50) * 50; gy < maxY; gy += 50) {
    g.beginPath();
    g.moveTo(0, Y(gy));
    g.lineTo(w, Y(gy));
    g.stroke();
  }

  // Gusts as darker water
  for (const p of course.puffs) {
    if (p.k <= 100) continue;
    const gr = g.createRadialGradient(X(p.x), Y(p.y), 0, X(p.x), Y(p.y), p.r * s);
    gr.addColorStop(0, 'rgba(3,22,34,0.5)');
    gr.addColorStop(1, 'rgba(3,22,34,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(X(p.x), Y(p.y), p.r * s, 0, Math.PI * 2);
    g.fill();
  }
  // Islands with shallows
  for (const isl of course.islands) {
    for (const [pad2, col] of [[10, 'rgba(53,194,184,0.35)'], [4, 'rgba(120,214,200,0.6)'], [0, '#ead9ad']] as const) {
      g.fillStyle = col;
      for (const p of isl.parts) {
        g.beginPath();
        g.arc(X(p.x), Y(p.y), (p.r + pad2) * s, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  // Start / finish line
  const line = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    g.strokeStyle = 'rgba(244,241,234,0.95)';
    g.setLineDash([4, 3]);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(X(a.x), Y(a.y));
    g.lineTo(X(b.x), Y(b.y));
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#f2c230';
    for (const p of [a, b]) {
      g.beginPath();
      g.arc(X(p.x), Y(p.y), 3, 0, Math.PI * 2);
      g.fill();
    }
  };
  line(course.start.a, course.start.b);
  if (course.finish.a.x !== course.start.a.x || course.finish.a.y !== course.start.a.y) line(course.finish.a, course.finish.b);

  // Example zigzag (start card)
  if (o.example !== undefined && course.marks[0]) {
    const m = course.marks[0];
    const sx = (course.start.a.x + course.start.b.x) / 2;
    const sy = (course.start.a.y + course.start.b.y) / 2;
    const dy = m.y - sy;
    const pts: Route = [
      [sx, sy],
      [sx - dy * 0.32, sy + dy * 0.36],
      [sx + dy * 0.2, sy + dy * 0.68],
      [m.x - 6, m.y - 3],
      [m.x - 8, m.y + 6],
      [m.x + 4, m.y + 9],
      [m.x + 9, m.y + 2],
      [sx + 6, sy + 2],
    ];
    strokeRoute(g, pts, X, Y, 'rgba(255,107,26,0.95)', 2.6, [], o.example);
  }

  for (const r of o.routes ?? []) strokeRoute(g, r.pts, X, Y, r.colour, r.width, r.dash ?? [], r.progress ?? 1);

  // Marks with rounding arrows
  for (const m of course.marks) {
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 1.5;
    const ccw = m.round === 'port';
    const r = 8;
    g.beginPath();
    g.arc(X(m.x), Y(m.y), r, ccw ? 0.2 : Math.PI - 0.2, ccw ? Math.PI * 1.1 : -0.1 * Math.PI, ccw);
    g.stroke();
    g.fillStyle = '#ff6b1a';
    g.beginPath();
    g.arc(X(m.x), Y(m.y), 4.5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#fff';
    g.lineWidth = 1.2;
    g.stroke();
  }

  // Wind arrow, top right
  const a = (course.wind.from / 4096) * Math.PI * 2;
  g.save();
  g.translate(w - 22, 24);
  g.rotate(a + Math.PI);
  g.strokeStyle = '#f4f1ea';
  g.lineWidth = 2.2;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(0, -12);
  g.lineTo(0, 10);
  g.moveTo(-5, 4);
  g.lineTo(0, 11);
  g.lineTo(5, 4);
  g.stroke();
  g.restore();
  g.fillStyle = 'rgba(244,241,234,0.75)';
  g.font = '600 11px "Barlow Condensed", sans-serif';
  g.textAlign = 'center';
  g.fillText('WIND', w - 22, 50);
}

function strokeRoute(
  g: CanvasRenderingContext2D,
  pts: Route,
  X: (x: number) => number,
  Y: (y: number) => number,
  colour: string,
  width: number,
  dash: number[],
  progress: number
): void {
  if (pts.length < 2) return;
  // total length for partial drawing
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(X(pts[i]![0]) - X(pts[i - 1]![0]), Y(pts[i]![1]) - Y(pts[i - 1]![1]));
    seg.push(d);
    total += d;
  }
  let left = total * Math.max(0, Math.min(1, progress));
  g.strokeStyle = colour;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.setLineDash(dash);
  g.beginPath();
  g.moveTo(X(pts[0]![0]), Y(pts[0]![1]));
  for (let i = 1; i < pts.length && left > 0; i++) {
    const d = seg[i - 1]!;
    const k = Math.min(1, left / d);
    const x = X(pts[i - 1]![0]) + (X(pts[i]![0]) - X(pts[i - 1]![0])) * k;
    const y = Y(pts[i - 1]![1]) + (Y(pts[i]![1]) - Y(pts[i - 1]![1])) * k;
    g.lineTo(x, y);
    left -= d;
  }
  g.stroke();
  g.setLineDash([]);
}

/** Which side of the course a route took on the first leg: -1 left, 1 right (looking upwind). */
export function sideOf(course: Course, pts: Route): -1 | 0 | 1 {
  const m = course.marks[0];
  if (!m || pts.length < 3) return 0;
  const sx = (course.start.a.x + course.start.b.x) / 2;
  const sy = (course.start.a.y + course.start.b.y) / 2;
  const dx = m.x - sx;
  const dy = m.y - sy;
  const len = Math.hypot(dx, dy);
  let sum = 0;
  let n = 0;
  for (const [x, y] of pts) {
    const along = ((x - sx) * dx + (y - sy) * dy) / (len * len);
    if (along < 0.05 || along > 0.9) continue;
    // cross > 0 means left of the start->mark line
    sum += (dx * (y - sy) - dy * (x - sx)) / len;
    n++;
  }
  if (!n) return 0;
  const avg = sum / n;
  return avg > 8 ? -1 : avg < -8 ? 1 : 0;
}
