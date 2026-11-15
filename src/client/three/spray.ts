// Bow spray: a small pool of soft droplets (at most 90) thrown up at speed, in gusts, on tacks
// and on impacts. One Points draw call, updated in place.
import { AdditiveBlending, BufferAttribute, BufferGeometry, DynamicDrawUsage, Points, ShaderMaterial } from 'three';

const N = 90;

export type Spray = {
  points: Points;
  /** Emit n droplets at (x, y) course metres, thrown along heading h (rad) at speed sp (m/s). */
  emit(n: number, x: number, y: number, h: number, sp: number, spread?: number): void;
  update(dt: number): void;
};

export function createSpray(): Spray {
  const pos = new Float32Array(N * 3);
  const life = new Float32Array(N);
  const size = new Float32Array(N);
  const vel = new Float32Array(N * 3);
  const geo = new BufferGeometry();
  const pa = new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage);
  const la = new BufferAttribute(life, 1).setUsage(DynamicDrawUsage);
  const sa = new BufferAttribute(size, 1);
  geo.setAttribute('position', pa);
  geo.setAttribute('aLife', la);
  geo.setAttribute('aSize', sa);
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexShader: `
      attribute float aLife; attribute float aSize; varying float vLife;
      void main() {
        vLife = aLife;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * (0.4 + 0.6 * aLife) * 300.0 / -mv.z;
        if (aLife <= 0.0) gl_PointSize = 0.0;
      }`,
    fragmentShader: `
      varying float vLife;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        float a = smoothstep(0.5, 0.15, d) * vLife * 0.75;
        gl_FragColor = vec4(vec3(0.95, 0.98, 1.0) * a, a);
      }`,
  });
  const points = new Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 6;
  let next = 0;
  return {
    points,
    emit(n, x, y, h, sp, spread = 1) {
      const fx = Math.sin(h);
      const fy = Math.cos(h);
      for (let k = 0; k < n; k++) {
        const i = next;
        next = (next + 1) % N;
        const side = Math.random() > 0.5 ? 1 : -1;
        // from either side of the bow, thrown outwards, up and a little forward
        const ox = x + fx * 2.6 + fy * side * 0.5;
        const oy = y + fy * 2.6 - fx * side * 0.5;
        pos[i * 3] = ox;
        pos[i * 3 + 1] = 0.3;
        pos[i * 3 + 2] = -oy;
        const out = (1.2 + Math.random() * 2.2) * spread;
        const fwd = sp * (0.25 + Math.random() * 0.35);
        vel[i * 3] = fx * fwd + fy * side * out;
        vel[i * 3 + 1] = 1.6 + Math.random() * 2.6 * spread;
        vel[i * 3 + 2] = -(fy * fwd - fx * side * out);
        life[i] = 1;
        size[i] = 0.25 + Math.random() * 0.45;
      }
      sa.needsUpdate = true;
    },
    update(dt) {
      for (let i = 0; i < N; i++) {
        if (life[i]! <= 0) continue;
        life[i] = life[i]! - dt * 1.6;
        vel[i * 3 + 1] = vel[i * 3 + 1]! - 9.8 * dt;
        pos[i * 3] = pos[i * 3]! + vel[i * 3]! * dt;
        pos[i * 3 + 1] = Math.max(0.02, pos[i * 3 + 1]! + vel[i * 3 + 1]! * dt);
        pos[i * 3 + 2] = pos[i * 3 + 2]! + vel[i * 3 + 2]! * dt;
        if (pos[i * 3 + 1]! <= 0.02) life[i] = Math.min(life[i]!, 0.15);
      }
      pa.needsUpdate = true;
      la.needsUpdate = true;
    },
  };
}
