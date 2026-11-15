// Racing marks, the start/finish line, rounding arrows and laylines.
import {
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from 'three';
import type { Course, Gate, Mark } from '../../shared/core/course';
import { toWorld } from './world';

const ORANGE = '#ff6b1a';

let ringTex: CanvasTexture | null = null;
function foamRing(radius: number): Mesh {
  if (!ringTex) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 10, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.42, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.62, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    ringTex = new CanvasTexture(cv);
  }
  const geo = new PlaneGeometry(radius * 2, radius * 2);
  geo.rotateX(-Math.PI / 2);
  const m = new Mesh(geo, new MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false }));
  m.position.y = 0.05;
  m.renderOrder = 2;
  return m;
}

function markBuoy(): Group {
  const g = new Group();
  g.add(foamRing(2.4));
  const body = new Mesh(new CylinderGeometry(0.75, 0.85, 1.9, 18), new MeshLambertMaterial({ color: ORANGE }));
  body.position.y = 0.75;
  const band = new Mesh(new CylinderGeometry(0.78, 0.79, 0.22, 18), new MeshLambertMaterial({ color: '#f4f1ea' }));
  band.position.y = 1.15;
  const top = new Mesh(new SphereGeometry(0.75, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), new MeshLambertMaterial({ color: ORANGE }));
  top.position.y = 1.7;
  g.add(body, band, top);
  return g;
}

/** Pin buoy with a flag for the ends of the start/finish line. */
function pin(colour: string): Group {
  const g = new Group();
  g.add(foamRing(1.4));
  const ball = new Mesh(new SphereGeometry(0.5, 14, 10), new MeshLambertMaterial({ color: colour }));
  ball.position.y = 0.2;
  const pole = new Mesh(new CylinderGeometry(0.03, 0.03, 2.6, 5), new MeshLambertMaterial({ color: '#2b2b2b' }));
  pole.position.y = 1.4;
  const flagGeo = new BufferGeometry();
  flagGeo.setAttribute('position', new Float32BufferAttribute([0, 2.65, 0, 0, 2.05, 0, 0.9, 2.35, 0], 3));
  flagGeo.computeVertexNormals();
  const flag = new Mesh(flagGeo, new MeshLambertMaterial({ color: '#1d4f91', side: DoubleSide }));
  g.add(ball, pole, flag);
  return g;
}

function dashTexture(): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 8;
  const g = cv.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,0)';
  g.fillRect(0, 0, 64, 8);
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.fillRect(0, 0, 38, 8);
  const t = new CanvasTexture(cv);
  t.wrapS = t.wrapT = 1000; // RepeatWrapping
  return t;
}

/** A flat dashed strip on the water between two points (course metres). */
function dashedStrip(a: { x: number; y: number }, b: { x: number; y: number }, width: number, colour: string, opacity: number): Mesh {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const nx = (-dy / len) * (width / 2);
  const ny = (dx / len) * (width / 2);
  const pts = [
    [a.x + nx, a.y + ny],
    [a.x - nx, a.y - ny],
    [b.x + nx, b.y + ny],
    [b.x - nx, b.y - ny],
  ];
  const pos: number[] = [];
  for (const [x, y] of pts) pos.push(x!, 0.06, -y!);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new Float32BufferAttribute([0, 0, 0, 1, len / 4, 0, len / 4, 1], 2));
  geo.setIndex([0, 1, 2, 1, 3, 2]);
  const tex = dashTexture();
  const m = new Mesh(geo, new MeshBasicMaterial({ map: tex, color: new Color(colour), transparent: true, opacity, depthWrite: false, side: DoubleSide }));
  m.renderOrder = 3;
  return m;
}

/** An arc on the water around a mark showing which way to round it. */
function roundingArrow(m: Mark, from: { x: number; y: number }): Mesh {
  const r0 = 5.2;
  const r1 = 6.0;
  const sweep = Math.PI * 1.15;
  const ccw = m.round === 'port';
  const geo = new RingGeometry(r0, r1, 40, 1, 0, sweep);
  // arrow head: a triangle at the end of the arc
  const end = sweep;
  const pos = Array.from(geo.getAttribute('position').array as Float32Array);
  const idx = Array.from(geo.getIndex()!.array);
  const base = pos.length / 3;
  const mid = (r0 + r1) / 2;
  const dirA = end + 0.28;
  pos.push(Math.cos(end) * (mid - 1.1), Math.sin(end) * (mid - 1.1), 0);
  pos.push(Math.cos(end) * (mid + 1.1), Math.sin(end) * (mid + 1.1), 0);
  pos.push(Math.cos(dirA) * mid, Math.sin(dirA) * mid, 0);
  idx.push(base, base + 1, base + 2);
  const g2 = new BufferGeometry();
  g2.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g2.setIndex(idx);
  g2.rotateX(-Math.PI / 2);
  // RingGeometry goes anticlockwise in its plane; after rotateX it is anticlockwise seen from
  // above, starting east of the mark. Mirror for starboard roundings (then it starts west).
  if (!ccw) g2.scale(-1, 1, 1);
  const mesh = new Mesh(g2, new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, depthWrite: false, side: DoubleSide }));
  mesh.position.copy(toWorld(m.x, m.y, 0.07));
  // Turn it so the arc begins on the side the boat arrives from.
  const approach = Math.atan2(from.y - m.y, from.x - m.x);
  mesh.rotation.y = approach + Math.PI / 2;
  mesh.renderOrder = 3;
  return mesh;
}

export type CourseMarks = {
  group: Group;
  setActive(leg: number, started: boolean): void;
  setLaylines(visible: boolean, windFromRad: number): void;
  update(time: number): void;
};

export function createCourseMarks(course: Course): CourseMarks {
  const group = new Group();
  const buoys: Group[] = [];
  const arrows: Mesh[] = [];
  course.marks.forEach((m, i) => {
    const prev = i === 0 ? { x: (course.start.a.x + course.start.b.x) / 2, y: (course.start.a.y + course.start.b.y) / 2 } : course.marks[i - 1]!;
    const b = markBuoy();
    b.position.copy(toWorld(m.x, m.y, 0));
    buoys.push(b);
    group.add(b);
    const a = roundingArrow(m, prev);
    arrows.push(a);
    group.add(a);
  });
  const gateObjs = (g: Gate, colour: string) => {
    const pa = pin('#f2c230');
    pa.position.copy(toWorld(g.a.x, g.a.y, 0));
    const pb = pin('#f2c230');
    pb.position.copy(toWorld(g.b.x, g.b.y, 0));
    const strip = dashedStrip(g.a, g.b, 0.6, colour, 0.85);
    group.add(pa, pb, strip);
    return { pa, pb, strip };
  };
  const start = gateObjs(course.start, '#ffffff');
  const sameLine = course.start.a.x === course.finish.a.x && course.start.a.y === course.finish.a.y && course.start.b.x === course.finish.b.x && course.start.b.y === course.finish.b.y;
  const finish = sameLine ? start : gateObjs(course.finish, '#ffffff');

  // Laylines from the next mark, at the close-hauled angle on each tack.
  const laylines = new Group();
  group.add(laylines);
  let laylineWind = Number.NaN;
  let laylineLeg = -1;
  let laylinesOn = false;
  let activeLeg = 0;

  const buildLaylines = (windFromRad: number) => {
    laylines.clear();
    const m = course.marks[activeLeg];
    if (!m || !laylinesOn) return;
    const up = (50 * Math.PI) / 180;
    for (const s of [-1, 1]) {
      // From the mark, back down the course along the close-hauled heading reversed.
      const hd = windFromRad + s * up + Math.PI;
      const far = { x: m.x + Math.sin(hd) * 140, y: m.y + Math.cos(hd) * 140 };
      laylines.add(dashedStrip({ x: m.x, y: m.y }, far, 0.35, '#ffe9a8', 0.55));
    }
  };

  return {
    group,
    setActive(leg, started) {
      activeLeg = leg;
      arrows.forEach((a, i) => (a.visible = started ? i === leg : i === 0));
      const toFinish = leg >= course.marks.length;
      (finish.strip.material as MeshBasicMaterial).color.set(toFinish ? '#ffd27a' : '#ffffff');
      (start.strip.material as MeshBasicMaterial).opacity = started && !toFinish ? 0.45 : 0.9;
    },
    setLaylines(visible, windFromRad) {
      if (visible === laylinesOn && Math.abs(windFromRad - laylineWind) < 0.01 && laylineLeg === activeLeg) return;
      laylinesOn = visible;
      laylineWind = windFromRad;
      laylineLeg = activeLeg;
      buildLaylines(windFromRad);
    },
    update(time) {
      buoys.forEach((b, i) => {
        b.position.y = Math.sin(time * 1.7 + i) * 0.08;
        b.rotation.z = Math.sin(time * 1.3 + i * 2) * 0.06;
        b.rotation.x = Math.cos(time * 1.1 + i) * 0.05;
      });
      for (const a of arrows) (a.material as MeshBasicMaterial).opacity = 0.55 + 0.25 * Math.sin(time * 3);
    },
  };
}

export const _v = new Vector3();
