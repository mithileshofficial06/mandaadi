// A traditional Coromandel-coast fishing boat (vallam) with a single lateen sail, built in code:
// lofted wooden hull painted in bands, a tarred bottom, wooden thwarts, mast and yard, a patched
// cotton sail with a painted sail number, two crew, a steering oar and a foam collar.
// Local space: forward = -z, right (starboard) = +x, up = +y. Origin at the waterline, midships.
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  BoxGeometry,
  DodecahedronGeometry,
  LatheGeometry,
  LineBasicMaterial,
  LineSegments,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { bake } from './bake';


export type Livery = {
  hull: string;
  band: string;
  stripe: string;
  sailNo: string;
  shirt: string;
};

export const LIVERIES: Livery[] = [
  { hull: '#1f5fa8', band: '#c8372d', stripe: '#f1c232', sailNo: '27', shirt: '#f2efe6' },
  { hull: '#1d7a5c', band: '#f1c232', stripe: '#f4f1ea', sailNo: '108', shirt: '#c8372d' },
  { hull: '#b8322a', band: '#1f3f78', stripe: '#f4f1ea', sailNo: '64', shirt: '#2b5d9a' },
  { hull: '#e0a526', band: '#1d5c8a', stripe: '#c8372d', sailNo: '9', shirt: '#f2efe6' },
  { hull: '#5b3f8f', band: '#f1c232', stripe: '#3aa6a0', sailNo: '351', shirt: '#e86a2b' },
];

const L = 6.6; // length
const B = 1.45; // beam
const ST = 22; // stations
const SEC = 12; // points across a section

function halfBeam(s: number): number {
  // s in [-1 stern, 1 bow]; fine entry at the bow, fuller stern
  const k = s > 0 ? Math.pow(s, 1.6) : Math.pow(-s, 2.6);
  return (B / 2) * Math.pow(Math.max(0, 1 - k), 0.62);
}
function sheer(s: number): number {
  // the vallam's upswept bow and a lifted stern
  return 0.52 + 0.95 * Math.pow(Math.max(s, 0), 3.4) + 0.38 * Math.pow(Math.max(-s, 0), 3.0);
}
function keel(s: number): number {
  return -0.38 * (1 - s * s * 0.85);
}
const zOf = (s: number) => (-s * L) / 2;

/** Lofted hull surface. inset > 0 builds the inner (wooden) skin. */
function hullSkin(inset: number, colourAt: (s: number, yRel: number, y: number) => Color, flip: boolean): BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const grid: Vector3[][] = [];
  for (let i = 0; i <= ST; i++) {
    const s = -0.985 + (i / ST) * 1.97;
    const row: Vector3[] = [];
    const b = Math.max(0.0, halfBeam(s) - inset);
    const top = sheer(s) - inset * 0.3;
    const bot = keel(s) + inset * 1.2;
    for (let k = 0; k <= SEC; k++) {
      const phi = ((k / SEC) * 2 - 1) * (Math.PI / 2);
      const x = b * Math.sin(phi) * (1 + 0.06 * Math.cos(phi));
      const y = bot + (top - bot) * Math.pow(1 - Math.cos(phi), 0.62);
      row.push(new Vector3(x, y, zOf(s)));
    }
    grid.push(row);
  }
  const push = (v: Vector3, s: number) => {
    pos.push(v.x, v.y, v.z);
    const top = sheer(s);
    const bot = keel(s);
    const c = colourAt(s, (v.y - bot) / (top - bot), v.y);
    col.push(c.r, c.g, c.b);
  };
  for (let i = 0; i < ST; i++) {
    const s0 = -0.985 + (i / ST) * 1.97;
    const s1 = -0.985 + ((i + 1) / ST) * 1.97;
    for (let k = 0; k < SEC; k++) {
      const a = grid[i]![k]!;
      const b = grid[i]![k + 1]!;
      const c = grid[i + 1]![k]!;
      const d = grid[i + 1]![k + 1]!;
      if (!flip) {
        push(a, s0); push(c, s1); push(b, s0);
        push(b, s0); push(c, s1); push(d, s1);
      } else {
        push(a, s0); push(b, s0); push(c, s1);
        push(b, s0); push(d, s1); push(c, s1);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.computeVertexNormals();
  return g;
}

/** The wooden rail along the sheer, joining the outer and inner skins. */
function gunwale(colour: Color): BufferGeometry {
  const pos: number[] = [];
  const inset = 0.07;
  const pts = (side: number, inner: boolean) => {
    const out: Vector3[] = [];
    for (let i = 0; i <= ST; i++) {
      const s = -0.985 + (i / ST) * 1.97;
      const b = Math.max(0, halfBeam(s) - (inner ? inset : 0));
      out.push(new Vector3(side * b * 1.0, sheer(s) - (inner ? inset * 0.3 : 0) + 0.035, zOf(s)));
    }
    return out;
  };
  for (const side of [-1, 1]) {
    const o = pts(side, false);
    const n = pts(side, true);
    for (let i = 0; i < ST; i++) {
      const a = o[i]!, b = o[i + 1]!, c = n[i]!, d = n[i + 1]!;
      if (side > 0) pos.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);
      else pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, b.x, b.y, b.z, d.x, d.y, d.z, c.x, c.y, c.z);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  const col = new Float32Array(pos.length);
  for (let i = 0; i < col.length; i += 3) { col[i] = colour.r; col[i + 1] = colour.g; col[i + 2] = colour.b; }
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** Hand-made looking canvas: weave, panel seams, patches, a stain at the foot and the sail number. */
function sailTexture(sailNo: string, ghost: boolean): CanvasTexture {
  const W = 256;
  const H = 256;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  g.fillStyle = ghost ? '#f6f3ec' : '#efe5cf';
  g.fillRect(0, 0, W, H);
  // weave noise
  const img = g.getImageData(0, 0, W, H);
  let seed = 1234;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 14;
    img.data[i] = img.data[i]! + n;
    img.data[i + 1] = img.data[i + 1]! + n;
    img.data[i + 2] = img.data[i + 2]! + n * 0.8;
  }
  g.putImageData(img, 0, 0);
  // panels parallel to the foot (v = 1 is the foot)
  g.strokeStyle = 'rgba(120, 95, 60, 0.35)';
  g.lineWidth = 1.5;
  for (let y = 22; y < H; y += 26) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y + 4);
    g.stroke();
  }
  if (!ghost) {
    // patches, slightly different cloth
    const patches = [[150, 60, 34, 22, '#e3d6b8'], [60, 150, 26, 30, '#f3ead6'], [180, 170, 30, 20, '#ddcfae']] as const;
    for (const [x, y, w, h, c] of patches) {
      g.fillStyle = c;
      g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(110, 85, 55, 0.5)';
      g.setLineDash([3, 3]);
      g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
      g.setLineDash([]);
    }
    // weathering at the foot
    const grad = g.createLinearGradient(0, H * 0.7, 0, H);
    grad.addColorStop(0, 'rgba(120, 90, 50, 0)');
    grad.addColorStop(1, 'rgba(120, 90, 50, 0.22)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
  }
  // sail number, hand painted
  g.fillStyle = ghost ? 'rgba(20, 33, 43, 0.85)' : '#8e2a20';
  g.font = '700 74px "Barlow Condensed", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.save();
  g.translate(W * 0.42, H * 0.6);
  g.rotate(-0.08);
  g.fillText(sailNo, 0, 0);
  g.restore();
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

// Sail corners in rig space (rig origin at the mast foot; the rig rotates about y).
// Lateen: the yard runs from the tack (forward, low) to the peak (aft, high); the clew is aft, low.
const TACK = new Vector3(0, 1.25, -2.7);
const PEAK = new Vector3(0, 8.4, 3.0);
const CLEW = new Vector3(0, 1.45, 2.65);
const SN = 10;

export type BoatModel = {
  root: Group;
  /** Update pose. twa: signed angle to wind (rad, + = wind from port). power 0..1. */
  pose(opts: { twa: number; speed: number; power: number; luff: number; steer: number; time: number; heel: number }): void;
  setOpacity(a: number): void;
};

/** A static hull with its fittings (no sail), as one vertex-coloured geometry: for boats on the beach. */
export function beachedHull(livery: Livery): BufferGeometry {
  const b = createBoat(livery);
  const g = b.root.children[0] as Group;
  // the first child of the hull group is the baked hull mesh
  return (g.children[0] as Mesh).geometry;
}

export function createBoat(livery: Livery, opts: { ghost?: boolean } = {}): BoatModel {
  const ghost = !!opts.ghost;
  const root = new Group();
  const hullGroup = new Group();
  root.add(hullGroup);

  const hullC = new Color(livery.hull);
  const bandC = new Color(livery.band);
  const stripeC = new Color(livery.stripe);
  const tar = new Color('#2a2420');
  const white = new Color('#ece8de');
  const wood = new Color('#8a5a32');
  const woodDark = new Color('#6b4426');
  const tmp = new Color();

  const outer = hullSkin(
    0,
    (s, t, y) => {
      if (y < 0.06) return tar;
      if (y < 0.13) return white;
      if (t > 0.9) return bandC;
      if (t > 0.82 && t < 0.86) return stripeC;
      // a painted eye near the bow, as on many Coromandel boats
      if (s > 0.72 && s < 0.8 && t > 0.62 && t < 0.74) return white;
      // plank seams
      const plank = (t * 7) % 1;
      if (t > 0.18 && t < 0.8 && plank < 0.07) return tmp.copy(hullC).multiplyScalar(0.62);
      return tmp.copy(hullC).multiplyScalar(0.9 + 0.1 * Math.sin(s * 40) * Math.sin(t * 23));
    },
    false
  );
  const inner = hullSkin(0.065, (s) => tmp.copy(wood).lerp(woodDark, 0.5 + 0.5 * Math.sin(s * 55)), true);
  const mats: MeshLambertMaterial[] = [];
  const mkMat = (o: ConstructorParameters<typeof MeshLambertMaterial>[0]) => {
    const m = new MeshLambertMaterial(o);
    if (ghost) {
      m.transparent = true;
      m.opacity = 0.5;
      m.depthWrite = false;
    }
    mats.push(m);
    return m;
  };
  const hullMat = mkMat({ vertexColors: true, side: DoubleSide });
  const fixed = new Group();
  fixed.add(new Mesh(outer, hullMat));
  fixed.add(new Mesh(inner, hullMat));
  fixed.add(new Mesh(gunwale(woodDark), hullMat));

  // Thwarts (seats) and a floor board.
  const woodMat = mkMat({ color: wood });
  for (const s of [0.42, 0.05, -0.45]) {
    const w = halfBeam(s) * 2 - 0.12;
    const th = new Mesh(new BoxGeometry(w, 0.05, 0.26), woodMat);
    th.position.set(0, sheer(s) - 0.16, zOf(s));
    fixed.add(th);
  }
  const floor = new Mesh(new BoxGeometry(0.6, 0.03, L * 0.62), mkMat({ color: woodDark }));
  floor.position.set(0, keel(0) + 0.14, 0);
  fixed.add(floor);

  // Mast, raked slightly forward.
  const mastFoot = new Vector3(0, 0.0, -0.95);
  const mast = new Mesh(new CylinderGeometry(0.05, 0.08, 7.0, 7), woodMat);
  mast.position.set(mastFoot.x, 3.4, mastFoot.z - 0.12);
  mast.rotation.x = -0.035;
  fixed.add(mast);

  // Stem post: the bow timber rising above the sheer, raked forward.
  const stem = new Mesh(new BoxGeometry(0.07, 0.75, 0.1), mkMat({ color: woodDark }));
  stem.position.set(0, sheer(0.97) + 0.15, zOf(0.975) - 0.05);
  stem.rotation.x = -0.45;
  fixed.add(stem);
  // Cargo: a clay water pot, a coiled net and an anchor stone.
  const potProfile = [
    [0.0, 0.0], [0.1, 0.0], [0.17, 0.06], [0.2, 0.15], [0.18, 0.26], [0.1, 0.32], [0.08, 0.36], [0.1, 0.38],
  ].map(([x, y]) => new Vector3(x, y, 0));
  const pot = new Mesh(new LatheGeometry(potProfile.map((v) => new Vector2(v.x, v.y)), 12), mkMat({ color: '#b5643a' }));
  pot.position.set(0.12, keel(0.55) + 0.16, zOf(0.55));
  fixed.add(pot);
  const net = new Mesh(new TorusGeometry(0.26, 0.09, 6, 14), mkMat({ color: '#6d7d55' }));
  net.rotation.x = Math.PI / 2;
  net.scale.set(1, 1, 0.6);
  net.position.set(-0.12, keel(0.2) + 0.2, zOf(0.2));
  fixed.add(net);
  const stone = new Mesh(new DodecahedronGeometry(0.13, 0), mkMat({ color: '#77736b' }));
  stone.position.set(0.05, keel(0.78) + 0.2, zOf(0.78));
  fixed.add(stone);
  hullGroup.add(new Mesh(bake(fixed), hullMat));

  // Rig: yard + sail, rotates about the mast.
  const rig = new Group();
  rig.position.copy(mastFoot);
  hullGroup.add(rig);
  const yardLen = TACK.distanceTo(PEAK) + 0.6;
  const yard = new Mesh(new CylinderGeometry(0.035, 0.06, yardLen, 6), woodMat);
  const mid = TACK.clone().add(PEAK).multiplyScalar(0.5);
  yard.position.copy(mid);
  yard.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), PEAK.clone().sub(TACK).normalize());
  rig.add(yard);

  // Sail mesh: a triangle grid (u along the luff from tack to peak, v towards the clew).
  const sailPos: number[] = [];
  const sailUv: number[] = [];
  const idx: number[] = [];
  const index: number[][] = [];
  let n = 0;
  for (let i = 0; i <= SN; i++) {
    index.push([]);
    for (let j = 0; j <= SN - i; j++) {
      const u = i / SN;
      const v = j / SN;
      const p = TACK.clone().multiplyScalar(1 - u - v).addScaledVector(PEAK, u).addScaledVector(CLEW, v);
      sailPos.push(p.x, p.y, p.z);
      // texture: x across the sail, y down towards the foot
      sailUv.push(0.08 + 0.84 * (v + u * 0.5), (p.y - 1.2) / 7.4);
      index[i]!.push(n++);
    }
  }
  for (let i = 0; i < SN; i++) {
    for (let j = 0; j < SN - i; j++) {
      const a = index[i]![j]!;
      const b = index[i + 1]![j]!;
      const c = index[i]![j + 1]!;
      idx.push(a, b, c);
      if (j < SN - i - 1) {
        const d = index[i + 1]![j + 1]!;
        idx.push(b, d, c);
      }
    }
  }
  const sailGeo = new BufferGeometry();
  const basePos = new Float32Array(sailPos);
  sailGeo.setAttribute('position', new BufferAttribute(new Float32Array(sailPos), 3));
  sailGeo.setAttribute('uv', new BufferAttribute(new Float32Array(sailUv), 2));
  sailGeo.setIndex(idx);
  sailGeo.computeVertexNormals();
  const sailMat = mkMat({ map: sailTexture(livery.sailNo, ghost), side: DoubleSide });
  // Read the painted number the right way round from both sides of the sail.
  sailMat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
        vec2 mUv = vMapUv;
        // the front face looks to starboard, where aft is on the viewer's left
        if (gl_FrontFacing) mUv.x = 1.0 - mUv.x;
        diffuseColor *= texture2D(map, mUv);
      #endif`
    );
  };
  const sail = new Mesh(sailGeo, sailMat);
  rig.add(sail);
  // Barycentric weights for the billow.
  const bary: Array<[number, number]> = [];
  for (let i = 0; i <= SN; i++) for (let j = 0; j <= SN - i; j++) bary.push([i / SN, j / SN]);

  // Crew: helmsman aft, a crew on the rail.
  const skin = mkMat({ color: '#6e4429' });
  const shirt = mkMat({ color: livery.shirt === '#f2efe6' ? '#d9d2c0' : livery.shirt });
  const lungi = mkMat({ color: '#2b4f7a' });
  const towel = mkMat({ color: '#c8372d' });
  const person = (seated: boolean) => {
    const g = new Group();
    const legs = new Mesh(new CapsuleGeometry(0.13, seated ? 0.22 : 0.5, 3, 6), lungi);
    legs.position.y = seated ? 0.2 : 0.42;
    if (seated) legs.rotation.x = Math.PI / 2.4;
    const torso = new Mesh(new CapsuleGeometry(0.17, 0.36, 3, 7), shirt);
    torso.position.y = seated ? 0.52 : 0.9;
    torso.scale.set(1.15, 1, 0.8);
    const arms = new Mesh(new CapsuleGeometry(0.06, 0.5, 2, 5), skin);
    arms.rotation.z = Math.PI / 2;
    arms.position.y = (seated ? 0.62 : 1.0);
    arms.position.z = -0.12;
    const head = new Mesh(new SphereGeometry(0.15, 10, 8), skin);
    head.position.y = seated ? 0.95 : 1.33;
    const hair = new Mesh(new SphereGeometry(0.153, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), mkMat({ color: '#1c1714' }));
    hair.position.y = head.position.y + 0.01;
    const band = new Mesh(new CylinderGeometry(0.158, 0.158, 0.05, 10), towel);
    band.position.y = head.position.y + 0.05;
    g.add(legs, torso, arms, head, hair, band);
    const baked = new Group();
    baked.add(new Mesh(bake(g), hullMat));
    return baked;
  };
  const helm = person(true);
  helm.position.set(0.15, sheer(-0.62) - 0.2, zOf(-0.62));
  hullGroup.add(helm);
  const crew = person(true);
  crew.position.set(0.45, sheer(0.0) - 0.2, zOf(-0.05));
  hullGroup.add(crew);

  // Steering oar over the starboard quarter.
  const oarPivot = new Group();
  oarPivot.position.set(0.55, sheer(-0.85), zOf(-0.85));
  const oar = new Mesh(new BoxGeometry(0.06, 0.06, 2.6), woodMat);
  oar.position.set(0, -0.35, 1.0);
  oar.rotation.x = 0.42;
  const blade = new Mesh(new BoxGeometry(0.05, 0.42, 0.7), woodMat);
  blade.position.set(0, -0.82, 2.05);
  blade.rotation.x = 0.42;
  const oarParts = new Group();
  oarParts.add(oar, blade);
  oarPivot.add(new Mesh(bake(oarParts), hullMat));
  hullGroup.add(oarPivot);

  // Ropes: the halyard from the masthead to the yard, and the sheet from the clew to the helmsman.
  const ropeMat = new LineBasicMaterial({ color: '#3a2e22', transparent: ghost, opacity: ghost ? 0.4 : 1 });
  const ropeGeo = new BufferGeometry();
  const ropePos = new Float32Array(4 * 3);
  ropeGeo.setAttribute('position', new BufferAttribute(ropePos, 3));
  const ropes = new LineSegments(ropeGeo, ropeMat);
  const clewIdx = Math.max(0, bary.findIndex(([u, v]) => u === 0 && v === 1));
  ropes.frustumCulled = false;
  hullGroup.add(ropes);
  const mastHead = new Vector3(mastFoot.x, 6.85, mastFoot.z - 0.35);
  const sheetEnd = new Vector3(0.25, sheer(-0.6) + 0.1, zOf(-0.6));
  const yardMid = TACK.clone().lerp(PEAK, 0.42);
  const rigPoint = (v: Vector3, out: Vector3) => {
    const c = Math.cos(rig.rotation.y);
    const sn = Math.sin(rig.rotation.y);
    return out.set(v.x * c + v.z * sn + rig.position.x, v.y + rig.position.y, -v.x * sn + v.z * c + rig.position.z);
  };
  const tmpA = new Vector3();

  // Foam collar where the hull meets the water: brighter with speed, a bow wave and side wash.
  const foamMat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uSpeed: { value: 0 }, uTime: { value: 0 }, uOpacity: { value: ghost ? 0.35 : 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vUv; uniform float uSpeed; uniform float uTime; uniform float uOpacity;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
        return mix(mix(h(i),h(i+vec2(1,0)),u.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x), u.y); }
      void main(){
        // uv.x across (0..1), uv.y along: 0 = stern end, 1 = bow end of the quad
        vec2 p = vec2((vUv.x - 0.5) * 4.0, (vUv.y - 0.5) * 10.0); // metres; hull spans y -3.3..3.3
        float s = clamp(p.y / 3.3, -1.0, 1.0);
        float hb = 0.72 * pow(max(0.0, 1.0 - pow(abs(s), s > 0.0 ? 1.6 : 2.6)), 0.62) + 0.05;
        float d = abs(p.x) - hb;
        float sp = clamp(uSpeed, 0.0, 1.4);
        float collar = exp(-max(d, 0.0) * (6.0 - sp * 2.5)) * step(-0.08, d);
        // bow wave: strongest forward of midships
        collar *= mix(0.35, 1.0, smoothstep(-0.6, 0.9, s));
        // wash spreading aft of the stern
        float aft = smoothstep(-3.0, -4.6, p.y) * exp(-abs(p.x) * 1.4) * smoothstep(-5.0, -3.3, p.y);
        float f = collar + aft * 0.8;
        float tex = n(vec2(p.x * 3.0, p.y * 2.0 + uTime * 6.0 * sp)) * 0.6 + n(p * 7.0 - uTime * 3.0) * 0.4;
        float a = f * smoothstep(0.25, 0.8, tex + f * 0.4) * sp * 1.1;
        gl_FragColor = vec4(vec3(0.97, 0.99, 1.0), clamp(a, 0.0, 0.9) * uOpacity);
      }`,
  });
  const foamGeo = new PlaneGeometry(4, 10);
  foamGeo.rotateX(-Math.PI / 2);
  const foam = new Mesh(foamGeo, foamMat);
  foam.position.y = 0.03;
  foam.renderOrder = 2;
  root.add(foam);

  const p = new Vector3();
  return {
    root,
    pose({ twa, speed, power, luff, steer, time, heel }) {
      const side = twa >= 0 ? 1 : -1;
      const a = Math.abs(twa);
      // Sheet: close-hauled about 12 degrees off the centreline, eased out to about 80 when running.
      const trim = Math.min(1.4, Math.max(0.2, (a - 0.6) * 0.6 + 0.2));
      const target = luff > 0.5 ? side * 0.08 : side * trim;
      rig.rotation.y += (target - rig.rotation.y) * 0.12;
      // Heel to leeward with power; crew hikes to windward.
      hullGroup.rotation.z += (-side * heel - hullGroup.rotation.z) * 0.06;
      hullGroup.rotation.x = Math.sin(time * 1.3) * 0.015 + Math.sin(time * 0.71) * 0.01 - speed * 0.012;
      hullGroup.position.y = Math.sin(time * 1.6) * 0.04;
      crew.position.x += (-side * 0.5 - crew.position.x) * 0.05;
      helm.position.x += (-side * 0.25 - helm.position.x) * 0.05;
      oarPivot.rotation.y = -steer * 0.35;
      // Sail billow (leeward), and flutter when luffing.
      const pos = sailGeo.getAttribute('position') as BufferAttribute;
      const depth = (0.25 + 0.75 * power) * 0.95 * (1 - luff * 0.75);
      for (let k = 0; k < bary.length; k++) {
        const [u, v] = bary[k]!;
        const w = 1 - u - v;
        // camber peaks a third back from the luff, zero on every edge
        const shape = 4.2 * w * u * v * 9 * (0.55 + 0.45 * (1 - u));
        let off = side * depth * Math.min(1, shape) * 0.85;
        if (luff > 0) off += luff * Math.sin(time * 19 + u * 9 + v * 13) * 0.18 * (u + v) * (1 - u);
        p.set(basePos[k * 3]!, basePos[k * 3 + 1]!, basePos[k * 3 + 2]!);
        pos.setXYZ(k, p.x + off, p.y, p.z);
      }
      pos.needsUpdate = true;
      sailGeo.computeVertexNormals();
      // Ropes as two segments: yard -> masthead (halyard), clew -> helmsman (sheet).
      rigPoint(yardMid, tmpA);
      ropePos.set([tmpA.x, tmpA.y, tmpA.z, mastHead.x, mastHead.y, mastHead.z], 0);
      rigPoint(p.set(pos.getX(clewIdx), basePos[clewIdx * 3 + 1]!, basePos[clewIdx * 3 + 2]!), tmpA);
      ropePos.set([tmpA.x, tmpA.y, tmpA.z, sheetEnd.x, sheetEnd.y, sheetEnd.z], 6);
      (ropeGeo.getAttribute('position') as BufferAttribute).needsUpdate = true;
      foamMat.uniforms.uSpeed!.value = speed;
      foamMat.uniforms.uTime!.value = time;
    },
    setOpacity(a) {
      for (const m of mats) m.opacity = a;
      ropeMat.opacity = a * 0.8;
      foamMat.uniforms.uOpacity!.value = a * 0.7;
    },
  };
}
