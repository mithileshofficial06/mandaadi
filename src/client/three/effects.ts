// On-water effects: the no-go cone, the foam wake, and faint wind streaks.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three';

// ------------------------------------------------------------------ no-go cone

export type Cone = { mesh: Mesh; update(x: number, y: number, windFromRad: number, warn: number, time: number): void };

export function createCone(halfAngleRad: number): Cone {
  const segs = 24;
  const r0 = 3.4;
  const r1 = 16;
  const pos: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = -halfAngleRad + (i / segs) * 2 * halfAngleRad;
    // a = 0 points north (forward into the wind) in local space (-z)
    pos.push(Math.sin(a) * r0, 0, -Math.cos(a) * r0, Math.sin(a) * r1, 0, -Math.cos(a) * r1);
    uv.push(i / segs, 0, i / segs, 1);
  }
  const idx: number[] = [];
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  geo.setIndex(idx);
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    uniforms: { uWarn: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vUv; uniform float uWarn; uniform float uTime;
      void main(){
        float side = min(vUv.x, 1.0 - vUv.x);
        float edge = 1.0 - smoothstep(0.0, 0.022, side);
        float fade = (1.0 - smoothstep(0.35, 1.0, vUv.y)) * smoothstep(0.0, 0.06, vUv.y);
        float pulse = 0.85 + 0.15 * sin(uTime * 6.0) * uWarn;
        float fill = mix(0.13, 0.34, uWarn) * (1.0 - side * 0.6);
        float a = (fill + edge * mix(0.35, 0.85, uWarn)) * fade * pulse;
        gl_FragColor = vec4(0.92, 0.27, 0.29, a);
      }`,
  });
  const mesh = new Mesh(geo, mat);
  mesh.renderOrder = 4;
  return {
    mesh,
    update(x, y, windFromRad, warn, time) {
      mesh.position.set(x, 0.09, -y);
      mesh.rotation.y = -windFromRad;
      mat.uniforms.uWarn!.value = warn;
      mat.uniforms.uTime!.value = time;
    },
  };
}

// ------------------------------------------------------------------ wake

const WAKE_N = 180;

export type Wake = {
  mesh: Mesh;
  /** Add a sample at the stern. */
  push(x: number, y: number, headingRad: number, speed01: number, time: number): void;
  update(time: number): void;
  reset(): void;
};

export function createWake(opts: { life?: number; opacity?: number } = {}): Wake {
  const life = opts.life ?? 14;
  const pts: Array<{ x: number; y: number; nx: number; ny: number; t: number; s: number; d: number }> = [];
  const pos = new Float32Array(WAKE_N * 2 * 3);
  const age = new Float32Array(WAKE_N * 2);
  const spd = new Float32Array(WAKE_N * 2);
  const uv = new Float32Array(WAKE_N * 2 * 2);
  const geo = new BufferGeometry();
  const posAttr = new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage);
  const ageAttr = new BufferAttribute(age, 1).setUsage(DynamicDrawUsage);
  const spdAttr = new BufferAttribute(spd, 1).setUsage(DynamicDrawUsage);
  const uvAttr = new BufferAttribute(uv, 2).setUsage(DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('aAge', ageAttr);
  geo.setAttribute('aSpeed', spdAttr);
  geo.setAttribute('uv', uvAttr);
  const idx: number[] = [];
  for (let i = 0; i < WAKE_N - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  geo.setIndex(idx);
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: opts.opacity ?? 1 } },
    vertexShader: `
      attribute float aAge; attribute float aSpeed;
      varying float vAge; varying float vSpeed; varying vec2 vUv;
      void main(){ vAge = aAge; vSpeed = aSpeed; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying float vAge; varying float vSpeed; varying vec2 vUv; uniform float uTime; uniform float uOpacity;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
        return mix(mix(h(i),h(i+vec2(1,0)),u.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x), u.y); }
      void main(){
        float across = abs(vUv.x - 0.5) * 2.0;           // 0 centre .. 1 edge
        float young = 1.0 - vAge;
        // turbulent foam in the centre when young, two edge lines (the wake's arms) as it ages
        float centre = (1.0 - smoothstep(0.0, 0.55, across)) * pow(young, 3.0);
        float arms = smoothstep(0.62, 0.86, across) * (1.0 - smoothstep(0.86, 1.0, across)) * pow(young, 1.6);
        float tex = n(vec2(vUv.x * 11.0, vUv.y * 1.3)) * 0.5 + n(vec2(vUv.x * 29.0, vUv.y * 3.1 + uTime * 0.7)) * 0.5;
        float foam = centre * smoothstep(0.42, 0.8, tex + young * 0.18) * 0.85 + arms * smoothstep(0.45, 0.75, tex) * 0.55;
        float track = (1.0 - smoothstep(0.0, 1.0, across)) * young * young * 0.1;
        float a = (foam + track) * clamp(vSpeed * 1.3, 0.0, 1.0);
        gl_FragColor = vec4(0.96, 0.98, 1.0, a * uOpacity);
      }`,
  });
  const mesh = new Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  let dist = 0;

  const rebuild = (time: number) => {
    const n = pts.length;
    for (let i = 0; i < WAKE_N; i++) {
      const p = pts[Math.min(i, n - 1)];
      const o = i * 2;
      if (!p) {
        age[o] = age[o + 1] = 1;
        continue;
      }
      const a = Math.min(1, (time - p.t) / life);
      const w = 0.45 + a * 4.6 * (0.3 + 0.7 * p.s);
      pos[o * 3] = p.x + p.nx * w;
      pos[o * 3 + 1] = 0.05;
      pos[o * 3 + 2] = -(p.y + p.ny * w);
      pos[o * 3 + 3] = p.x - p.nx * w;
      pos[o * 3 + 4] = 0.05;
      pos[o * 3 + 5] = -(p.y - p.ny * w);
      age[o] = age[o + 1] = i >= n ? 1 : a;
      spd[o] = spd[o + 1] = p.s;
      uv[o * 2] = 0;
      uv[o * 2 + 1] = p.d;
      uv[o * 2 + 2] = 1;
      uv[o * 2 + 3] = p.d;
    }
    posAttr.needsUpdate = ageAttr.needsUpdate = spdAttr.needsUpdate = uvAttr.needsUpdate = true;
  };

  return {
    mesh,
    push(x, y, h, s, time) {
      const last = pts[0];
      if (last) dist += Math.hypot(x - last.x, y - last.y);
      // newest first; normal is perpendicular to the heading
      pts.unshift({ x, y, nx: Math.cos(h), ny: -Math.sin(h), t: time, s, d: dist });
      if (pts.length > WAKE_N) pts.pop();
    },
    update(time) {
      mat.uniforms.uTime!.value = time;
      rebuild(time);
    },
    reset() {
      pts.length = 0;
      dist = 0;
    },
  };
}

// ------------------------------------------------------------------ wind streaks

export type Streaks = { mesh: InstancedMesh; update(cx: number, cy: number, windFromRad: number, strength: number, dt: number): void };

export function createStreaks(count = 46): Streaks {
  const geo = new PlaneGeometry(0.16, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.22, depthWrite: false, blending: AdditiveBlending });
  const mesh = new InstancedMesh(geo, mat, count);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  const R = 70;
  const s = Array.from({ length: count }, (_, i) => ({ x: (Math.random() - 0.5) * 2 * R, y: (Math.random() - 0.5) * 2 * R, life: Math.random(), len: 3 + Math.random() * 5, sp: 0.8 + Math.random() * 0.5, i }));
  const m = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const scale = new Vector3();
  const p = new Vector3();
  return {
    mesh,
    update(cx, cy, wf, strength, dt) {
      const tx = -Math.sin(wf);
      const ty = -Math.cos(wf);
      q.setFromAxisAngle(up, -wf);
      for (const k of s) {
        k.life += dt * 0.45 * k.sp;
        k.x += tx * dt * 9 * k.sp * strength;
        k.y += ty * dt * 9 * k.sp * strength;
        if (k.life > 1 || Math.abs(k.x) > R || Math.abs(k.y) > R) {
          k.life = 0;
          k.x = (Math.random() - 0.5) * 2 * R;
          k.y = (Math.random() - 0.5) * 2 * R;
        }
        const fade = Math.sin(k.life * Math.PI);
        p.set(cx + k.x, 0.35 + k.i * 0.002, -(cy + k.y));
        scale.set(fade, 1, k.len * (0.6 + strength * 0.5) * fade + 0.001);
        m.compose(p, q, scale);
        mesh.setMatrixAt(k.i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mat.opacity = 0.1 + 0.16 * Math.min(1.5, strength);
    },
  };
}
