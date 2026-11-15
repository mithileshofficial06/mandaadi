// Islands and the mainland: sand built from the same smooth outline the water uses, wet sand at
// the edge, scrub inland, coconut palms that sway with the wind, rocks, and soft palm shadows.
// All procedural (no image assets).
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Object3D,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Course } from '../../shared/core/course';
import { type LandShape, MAINLAND, landSdf } from './world';

// Small seeded RNG (client only, cosmetic).
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function vnoise(x: number, y: number): number {
  const s = Math.sin(x * 0.37 + Math.sin(y * 0.21) * 1.7) + Math.sin(y * 0.29 - Math.cos(x * 0.17) * 1.3);
  return s * 0.25 + 0.5;
}

const WET = new Color('#b39a68');
const DRY = new Color('#ecdcb0');
const DUNE = new Color('#e2cc98');
const SCRUB = new Color('#7f8a48');
const SCRUB2 = new Color('#5d7436');
const WRACK = new Color('#8f7a52');

/** Ground height from the inland distance e (metres inside the shore; negative = under water). */
function groundHeight(e: number, x: number, y: number): number {
  if (e <= 0) return e * 0.22;
  const beach = 1.1 * (1 - Math.exp(-e / 3.2));
  const dunes = e > 3 ? (vnoise(x * 1.7, y * 1.7) - 0.5) * 0.6 * Math.min(1, (e - 3) / 5) : 0;
  return beach + dunes + Math.min(e, 30) * 0.03;
}

function groundColour(e: number, x: number, y: number, out: Color): Color {
  if (e < 0.9) return out.copy(WET).lerp(DRY, Math.max(0, e) / 0.9 * 0.25);
  if (e < 1.8) return out.copy(WRACK).lerp(DRY, 0.55 + 0.45 * vnoise(x * 3, y * 3));
  if (e < 6) return out.copy(DRY).lerp(DUNE, vnoise(x * 0.8, y * 0.8));
  const k = Math.min(1, (e - 6) / 4) * (0.55 + 0.45 * vnoise(x * 0.5, y * 0.5));
  out.copy(DUNE).lerp(vnoise(x * 1.3, y * 0.9) > 0.5 ? SCRUB : SCRUB2, k);
  return out;
}

type Ground = { geo: BufferGeometry; heightAt(x: number, y: number): number };

function buildGround(shape: LandShape, x0: number, y0: number, x1: number, y1: number, step: number): Ground {
  const nx = Math.ceil((x1 - x0) / step) + 1;
  const ny = Math.ceil((y1 - y0) / step) + 1;
  const pos = new Float32Array(nx * ny * 3);
  const col = new Float32Array(nx * ny * 3);
  const es = new Float32Array(nx * ny);
  const c = new Color();
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * step;
      const y = y0 + j * step;
      const e = -landSdf(shape, x, y);
      const k = j * nx + i;
      es[k] = e;
      pos[k * 3] = x;
      pos[k * 3 + 1] = groundHeight(e, x, y);
      pos[k * 3 + 2] = -y;
      groundColour(e, x, y, c);
      col[k * 3] = c.r;
      col[k * 3 + 1] = c.g;
      col[k * 3 + 2] = c.b;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const d = a + nx;
      const e = d + 1;
      if (Math.max(es[a]!, es[b]!, es[d]!, es[e]!) < -2.5) continue;
      // z = -y flips handedness: wind so faces point up.
      idx.push(a, b, d, b, e, d);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('color', new BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return {
    geo,
    heightAt: (x, y) => groundHeight(-landSdf(shape, x, y), x, y),
  };
}

// ---------------------------------------------------------------- palms

const TRUNK = new Color('#8a7a63');
const TRUNK_DARK = new Color('#6b5c49');
const FROND = new Color('#3f6e27');
const FROND_TIP = new Color('#86a13c');
const FROND_OLD = new Color('#a58f4e');
const NUT = new Color('#5e4320');

function paint(geo: BufferGeometry, f: (p: Vector3, i: number) => Color): BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const p = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const c = f(p, i);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}

/** One frond: a drooping rachis with leaflets hanging in a V. Built in palm-local space. */
function frond(top: Vector3, dir: Vector3, len: number, droop: number, old: boolean, r: () => number): BufferGeometry {
  const segs = 9;
  const pos: number[] = [];
  const cols: number[] = [];
  const side = new Vector3(-dir.z, 0, dir.x).normalize();
  const pts: Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = top.clone().addScaledVector(dir, t * len);
    p.y += Math.sin(t * Math.PI * 0.55) * len * 0.22 - t * t * len * droop;
    pts.push(p);
  }
  const c0 = old ? FROND_OLD : FROND;
  const c = new Color();
  for (let i = 0; i < segs; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const t = i / segs;
    const w = Math.sin(Math.PI * Math.min(1, 0.15 + t)) * len * 0.26 * (0.85 + r() * 0.3);
    for (const s of [-1, 1]) {
      const tipA = a.clone().addScaledVector(side, s * w).add(new Vector3(0, -w * 0.55, 0));
      const tipB = b.clone().addScaledVector(side, s * w * 0.8).add(new Vector3(0, -w * 0.5, 0));
      // two triangles per side per segment, slightly jagged for leaflet edges
      const jag = (r() - 0.5) * 0.25;
      tipA.y += jag;
      pos.push(a.x, a.y, a.z, tipA.x, tipA.y, tipA.z, b.x, b.y, b.z);
      pos.push(b.x, b.y, b.z, tipA.x, tipA.y, tipA.z, tipB.x, tipB.y, tipB.z);
      for (let k = 0; k < 6; k++) {
        c.copy(c0).lerp(FROND_TIP, t * 0.8 + (k % 3 === 0 ? 0 : 0.15));
        c.multiplyScalar(0.85 + r() * 0.25);
        cols.push(c.r, c.g, c.b);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(cols), 3));
  g.computeVertexNormals();
  return g;
}

/** A whole coconut palm at the origin, leaning towards `lean` (xz unit vector). */
function palm(seed: number, lean: Vector3): BufferGeometry {
  const r = rng(seed);
  const h = 9 + r() * 5.5;
  const tilt = 0.15 + r() * 0.3;
  const pts: Vector3[] = [];
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    const off = Math.pow(t, 1.6) * h * tilt;
    pts.push(new Vector3(lean.x * off, t * h, lean.z * off));
  }
  const curve = new CatmullRomCurve3(pts);
  const trunk = new TubeGeometry(curve, 12, 0.26, 6, false);
  // taper: scale radius by height
  const tp = trunk.getAttribute('position');
  const centre = new Vector3();
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i);
    const t = Math.min(1, Math.max(0, y / h));
    centre.copy(curve.getPoint(t));
    const k = 1.25 - 0.5 * t;
    tp.setX(i, centre.x + (tp.getX(i) - centre.x) * k);
    tp.setZ(i, centre.z + (tp.getZ(i) - centre.z) * k);
  }
  const trunkC = paint(trunk, (p) => (Math.sin(p.y * 9) > 0.2 ? TRUNK : TRUNK_DARK));
  const parts: BufferGeometry[] = [trunkC];
  const top = pts[5]!.clone();
  const n = 8 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.4;
    const dir = new Vector3(Math.cos(a), 0, Math.sin(a));
    const old = i % 4 === 3;
    parts.push(frond(top, dir, 4.6 + r() * 1.8, old ? 0.75 : 0.42 + r() * 0.2, old, r));
  }
  for (let i = 0; i < 4; i++) {
    const nut = new SphereGeometry(0.17, 6, 5);
    const a = i * 1.7;
    nut.translate(top.x + Math.cos(a) * 0.28, top.y - 0.35, top.z + Math.sin(a) * 0.28);
    parts.push(paint(nut, () => NUT));
  }
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false)!;
}

function shadowTexture(): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0, 'rgba(40,30,15,0.55)');
  grad.addColorStop(0.6, 'rgba(40,30,15,0.28)');
  grad.addColorStop(1, 'rgba(40,30,15,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(cv);
}

export type Land = { group: Group; update(time: number): void };

/** Sway: displace vertices by height, along the wind, with a per-palm phase. */
function swayMaterial(windTo: Vector3): { mat: MeshLambertMaterial; uniforms: { uTime: { value: number } } } {
  const uniforms = { uTime: { value: 0 } };
  const mat = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWind = { value: windTo };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec3 uWind;\nattribute float aBase;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float hh = max(position.y - aBase, 0.0);
        float ph = aBase * 3.1 + position.x * 0.05 + position.z * 0.07;
        float sw = (sin(uTime * 1.3 + ph) * 0.5 + sin(uTime * 2.9 + ph * 1.7) * 0.18 + 0.6) * hh * hh * 0.0035;
        transformed += uWind * sw;
        transformed.y -= sw * 0.25;`
      );
  };
  return { mat, uniforms };
}

export function createLand(course: Course, windToRad: number, sunDir: Vector3): Land {
  const group = new Group();
  const groundMat = new MeshLambertMaterial({ vertexColors: true });
  const palmGeos: BufferGeometry[] = [];
  const shadows: Array<{ x: number; y: number; h: number; s: number }> = [];
  const rocks: Array<{ x: number; y: number; h: number; s: number; rot: number }> = [];
  const shadowDir = new Vector3(-sunDir.x, 0, -sunDir.z).normalize();

  const placePalms = (shape: LandShape, ground: Ground, count: number, seed: number, area: [number, number, number, number], minE: number, maxE: number) => {
    const r = rng(seed);
    const placed: Array<{ x: number; y: number }> = [];
    let tries = 0;
    while (placed.length < count && tries++ < count * 60) {
      const x = area[0] + r() * (area[2] - area[0]);
      const y = area[1] + r() * (area[3] - area[1]);
      const e = -landSdf(shape, x, y);
      if (e < minE || e > maxE) continue;
      if (placed.some((p) => Math.hypot(p.x - x, p.y - y) < 4.5)) continue;
      placed.push({ x, y });
      // lean towards the sea: away from the nearest inland direction
      const gx = landSdf(shape, x + 0.5, y) - landSdf(shape, x - 0.5, y);
      const gy = landSdf(shape, x, y + 0.5) - landSdf(shape, x, y - 0.5);
      const lean = new Vector3(gx, 0, -gy).normalize();
      if (!Number.isFinite(lean.x)) lean.set(1, 0, 0);
      lean.x += (r() - 0.5) * 0.6;
      lean.z += (r() - 0.5) * 0.6;
      lean.normalize();
      const h = ground.heightAt(x, y);
      const geo = palm(seed * 131 + placed.length, lean);
      const base = new Float32Array(geo.getAttribute('position').count).fill(0);
      geo.translate(x, h - 0.1, -y);
      for (let i = 0; i < base.length; i++) base[i] = h - 0.1;
      geo.setAttribute('aBase', new BufferAttribute(base, 1));
      palmGeos.push(geo);
      shadows.push({ x: x + lean.x * 3 + shadowDir.x * 6, y: y - lean.z * 3 - shadowDir.z * 6, h: h + 0.06, s: 9 + r() * 3 });
    }
  };

  const bushes: Array<{ x: number; y: number; h: number; s: number; c: number }> = [];
  const placeBushes = (shape: LandShape, ground: Ground, count: number, seed: number, area: [number, number, number, number], minE: number, maxE: number) => {
    const r = rng(seed);
    let n = 0;
    let tries = 0;
    while (n < count && tries++ < count * 30) {
      const x = area[0] + r() * (area[2] - area[0]);
      const y = area[1] + r() * (area[3] - area[1]);
      const e = -landSdf(shape, x, y);
      if (e < minE || e > maxE) continue;
      // clumps: favour places where a slow noise is high
      if (vnoise(x * 0.09, y * 0.09) < 0.45 + r() * 0.2) continue;
      bushes.push({ x, y, h: ground.heightAt(x, y), s: 1.2 + r() * 2.6, c: r() });
      n++;
    }
  };

  course.islands.forEach((isl, n) => {
    const shape: LandShape = { circles: isl.parts.map((p) => ({ ...p })) };
    const xs = isl.parts.map((p) => [p.x - p.r - 8, p.x + p.r + 8]).flat();
    const ys = isl.parts.map((p) => [p.y - p.r - 8, p.y + p.r + 8]).flat();
    const box: [number, number, number, number] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const ground = buildGround(shape, box[0], box[1], box[2], box[3], 0.9);
    group.add(new Mesh(ground.geo, groundMat));
    placePalms(shape, ground, isl.palms, 1000 + n * 17, box, 2.5, 99);
    placeBushes(shape, ground, Math.round(isl.parts.reduce((a, p) => a + p.r * p.r, 0) / 40), 500 + n, box, 5, 99);
    const r = rng(77 + n);
    for (let i = 0; i < 4; i++) {
      const p = isl.parts[i % isl.parts.length]!;
      const a = r() * Math.PI * 2;
      const d = p.r - 0.5 + r() * 2.5;
      const x = p.x + Math.cos(a) * d;
      const y = p.y + Math.sin(a) * d;
      if (-landSdf(shape, x, y) > 1.5) continue;
      rocks.push({ x, y, h: ground.heightAt(x, y) - 0.25, s: 0.6 + r() * 1.1, rot: r() * 6 });
    }
  });

  // Mainland: a long beach along the west, lined with palms. Only the near strip is built.
  {
    const shape: LandShape = { circles: [MAINLAND] };
    const ground = buildGround(shape, -470, -300, -60, 700, 3);
    group.add(new Mesh(ground.geo, groundMat));
    placePalms(shape, ground, 150, 4242, [-260, -280, -70, 680], 5, 150);
    placeBushes(shape, ground, 520, 99, [-300, -280, -70, 680], 9, 220);
  }

  // Palms: one merged mesh with wind sway.
  const windTo = new Vector3(Math.sin(windToRad), 0, -Math.cos(windToRad));
  const sway = swayMaterial(windTo);
  if (palmGeos.length) {
    const merged = mergeGeometries(palmGeos, false)!;
    group.add(new Mesh(merged, sway.mat));
  }

  // Soft palm shadows on the sand.
  if (shadows.length) {
    const tex = shadowTexture();
    const mat = new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const quad = new PlaneGeometry(1, 1);
    quad.rotateX(-Math.PI / 2);
    const inst = new InstancedMesh(quad, mat, shadows.length);
    const m = new Matrix4();
    const q = new Quaternion();
    shadows.forEach((s, i) => {
      m.compose(new Vector3(s.x, s.h, -s.y), q, new Vector3(s.s, 1, s.s * 0.8));
      inst.setMatrixAt(i, m);
    });
    inst.renderOrder = 1;
    group.add(inst);
  }

  // Bushes: low clumps of scrub in three greens.
  if (bushes.length) {
    const bg = new IcosahedronGeometry(1, 1);
    const bp = bg.getAttribute('position');
    const br = rng(31);
    for (let k = 0; k < bp.count; k++) {
      const j = 0.8 + br() * 0.35;
      bp.setXYZ(k, bp.getX(k) * j, Math.max(-0.2, bp.getY(k)) * j * 0.62, bp.getZ(k) * j);
    }
    bg.computeVertexNormals();
    const inst = new InstancedMesh(bg, new MeshLambertMaterial({ color: '#ffffff', flatShading: true }), bushes.length);
    const m = new Matrix4();
    const greens = [new Color('#4d6b2a'), new Color('#62803a'), new Color('#3d5a26'), new Color('#7c8a44')];
    bushes.forEach((b, k) => {
      m.compose(new Vector3(b.x, b.h - 0.15, -b.y), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), b.c * 6), new Vector3(b.s, b.s, b.s * (0.8 + b.c * 0.4)));
      inst.setMatrixAt(k, m);
      inst.setColorAt(k, greens[Math.floor(b.c * greens.length)]!);
    });
    group.add(inst);
  }

  // Rocks: weathered, half buried at the waterline.
  if (rocks.length) {
    const rg = new IcosahedronGeometry(1, 1);
    const rp = rg.getAttribute('position');
    const rr = rng(9);
    for (let i = 0; i < rp.count; i++) {
      const k = 0.75 + rr() * 0.4;
      rp.setXYZ(i, rp.getX(i) * k, rp.getY(i) * k * 0.7, rp.getZ(i) * k);
    }
    rg.computeVertexNormals();
    const inst = new InstancedMesh(rg, new MeshLambertMaterial({ color: '#6f675c', flatShading: true }), rocks.length);
    const m = new Matrix4();
    rocks.forEach((k, i) => {
      m.compose(new Vector3(k.x, k.h, -k.y), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), k.rot), new Vector3(k.s, k.s, k.s));
      inst.setMatrixAt(i, m);
    });
    group.add(inst);
  }

  return {
    group,
    update(time) {
      sway.uniforms.uTime.value = time;
    },
  };
}

export type { Object3D };
