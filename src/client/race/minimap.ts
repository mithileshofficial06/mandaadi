// GPS minimap (bottom-left, like a driving game's radar). Centred on your boat and turned with the
// camera, so "up" on the map is "ahead" on screen. Drawn on its own canvas by the game loop.
import type { Course } from '../../shared/core/course';

export type MiniState = {
  x: number;
  y: number;
  heading: number; // compass rad
  speed: number; // m/s
  yaw: number; // camera yaw (compass rad)
  windFrom: number; // rad
  noGo: number; // rad
  target: { x: number; y: number };
  nextMark: number; // index, or -1 for the finish
  trail: Array<[number, number]>;
  others: Array<{ x: number; y: number; me?: boolean }>;
  puffs: Array<{ x: number; y: number; r: number; k: number }>;
  shoals?: Array<{ x: number; y: number; taken: boolean }>;
};

const RANGE = 150; // metres from the centre to the rim

export class Minimap {
  private g: CanvasRenderingContext2D;
  private last = 0;
  constructor(
    private readonly cv: HTMLCanvasElement,
    private readonly course: Course
  ) {
    this.g = cv.getContext('2d')!;
  }

  draw(st: MiniState, now: number): void {
    if (now - this.last < 50) return; // 20 fps is plenty
    this.last = now;
    const cv = this.cv;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = cv.clientWidth;
    if (!size) return;
    if (cv.width !== Math.round(size * dpr)) cv.width = cv.height = Math.round(size * dpr);
    const g = this.g;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const R = size / 2;
    const s = (R - 6) / RANGE;
    g.clearRect(0, 0, size, size);
    g.save();
    g.beginPath();
    g.arc(R, R, R - 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = 'rgba(11,69,98,0.88)';
    g.fillRect(0, 0, size, size);
    // world -> map: translate to the boat, rotate so the camera yaw points up
    const cy = Math.cos(st.yaw);
    const sy = Math.sin(st.yaw);
    const P = (x: number, y: number): [number, number] => {
      const dx = x - st.x;
      const dy = y - st.y;
      return [R + (dx * cy - dy * sy) * s, R - (dx * sy + dy * cy) * s];
    };
    const c = this.course;
    for (const p of st.puffs) {
      if (p.k <= 1) continue;
      const [px, py] = P(p.x, p.y);
      const gr = g.createRadialGradient(px, py, 0, px, py, p.r * s);
      gr.addColorStop(0, 'rgba(2,20,32,0.6)');
      gr.addColorStop(1, 'rgba(2,20,32,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(px, py, p.r * s, 0, Math.PI * 2);
      g.fill();
    }
    for (const isl of c.islands)
      for (const p of isl.parts) {
        const [px, py] = P(p.x, p.y);
        g.fillStyle = 'rgba(53,194,184,0.45)';
        g.beginPath();
        g.arc(px, py, (p.r + 6) * s, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#ead9ad';
        g.beginPath();
        g.arc(px, py, p.r * s, 0, Math.PI * 2);
        g.fill();
      }
    // start / finish line
    const line = (a: { x: number; y: number }, b: { x: number; y: number }, col: string) => {
      const [ax, ay] = P(a.x, a.y);
      const [bx, by] = P(b.x, b.y);
      g.strokeStyle = col;
      g.lineWidth = 2;
      g.setLineDash([3, 2]);
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.stroke();
      g.setLineDash([]);
    };
    line(c.start.a, c.start.b, st.nextMark === -1 ? '#ffd27a' : 'rgba(244,241,234,0.8)');
    // fish shoals
    for (const f of st.shoals ?? []) {
      if (f.taken) continue;
      const [fx, fy] = P(f.x, f.y);
      g.fillStyle = 'rgba(190,240,247,0.85)';
      g.beginPath();
      g.arc(fx, fy, 3, 0, Math.PI * 2);
      g.fill();
    }
    // trail
    if (st.trail.length > 1) {
      g.strokeStyle = 'rgba(255,107,26,0.55)';
      g.lineWidth = 2;
      g.beginPath();
      st.trail.forEach(([x, y], i) => {
        const [px, py] = P(x, y);
        if (i) g.lineTo(px, py);
        else g.moveTo(px, py);
      });
      g.stroke();
    }
    // GPS route to the next target
    const [tx, ty] = P(st.target.x, st.target.y);
    g.strokeStyle = 'rgba(255,210,122,0.9)';
    g.setLineDash([2, 4]);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(R, R);
    g.lineTo(tx, ty);
    g.stroke();
    g.setLineDash([]);
    // marks
    c.marks.forEach((m, i) => {
      const [mx, my] = P(m.x, m.y);
      const next = i === st.nextMark;
      g.fillStyle = '#ff6b1a';
      g.beginPath();
      g.arc(mx, my, next ? 6 : 4, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#fff';
      g.lineWidth = next ? 2 : 1;
      g.stroke();
      if (next) {
        g.fillStyle = '#fff';
        g.font = '700 11px "Barlow Condensed", sans-serif';
        g.textAlign = 'center';
        g.fillText(String(i + 1), mx, my - 9);
      }
    });
    // other boats
    for (const o of st.others) {
      const [ox, oy] = P(o.x, o.y);
      g.fillStyle = 'rgba(244,241,234,0.9)';
      g.beginPath();
      g.arc(ox, oy, 2.6, 0, Math.PI * 2);
      g.fill();
    }
    // faint no-go cone and the 5 s projection from my boat
    const rel = (a: number) => a - st.yaw;
    const w = rel(st.windFrom);
    g.fillStyle = 'rgba(229,72,77,0.25)';
    g.beginPath();
    g.moveTo(R, R);
    g.arc(R, R, 34, w - st.noGo - Math.PI / 2, w + st.noGo - Math.PI / 2);
    g.closePath();
    g.fill();
    const h = rel(st.heading);
    const ahead = st.speed * 5 * s;
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(R, R);
    g.lineTo(R + Math.sin(h) * ahead, R - Math.cos(h) * ahead);
    g.stroke();
    // me: an arrow
    g.save();
    g.translate(R, R);
    g.rotate(h);
    g.fillStyle = '#ff6b1a';
    g.strokeStyle = '#fff';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -9);
    g.lineTo(6, 7);
    g.lineTo(0, 3.5);
    g.lineTo(-6, 7);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    g.restore();
    // rim: N and the wind
    g.strokeStyle = 'rgba(244,241,234,0.55)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(R, R, R - 2, 0, Math.PI * 2);
    g.stroke();
    const nA = rel(0);
    g.fillStyle = '#fff';
    g.font = '700 12px "Barlow Condensed", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('N', R + Math.sin(nA) * (R - 11), R - Math.cos(nA) * (R - 11));
    // wind arrow on the rim, pointing the way the wind blows
    g.save();
    g.translate(R + Math.sin(w) * (R - 12), R - Math.cos(w) * (R - 12));
    g.rotate(w + Math.PI);
    g.fillStyle = '#bff1f7';
    g.beginPath();
    g.moveTo(0, 6);
    g.lineTo(5, -4);
    g.lineTo(-5, -4);
    g.closePath();
    g.fill();
    g.restore();
  }
}
