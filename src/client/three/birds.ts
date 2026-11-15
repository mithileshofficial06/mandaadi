// Gulls wheeling over the islands and the course. One instanced mesh; wings flap in the vertex
// shader (per-instance phase from gl_InstanceID), so it costs one draw call.
import { BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';

type Gull = { cx: number; cy: number; r: number; h: number; w: number; a: number; dir: number };

function gullGeometry(): BufferGeometry {
  // body along -z (forward), wings along x; aWing = 0 at the body, 1 at the tips
  const P: number[] = [];
  const C: number[] = [];
  const W: number[] = [];
  const white = [0.95, 0.95, 0.93];
  const grey = [0.62, 0.64, 0.66];
  const dark = [0.18, 0.18, 0.2];
  const tri = (a: number[], b: number[], c: number[], ca: number[], cb: number[], cc: number[], wa: number, wb: number, wc: number) => {
    P.push(...a, ...b, ...c);
    C.push(...ca, ...cb, ...cc);
    W.push(wa, wb, wc);
  };
  // body
  tri([0, 0, -0.45], [0.09, 0, 0.3], [-0.09, 0, 0.3], white, white, white, 0, 0, 0);
  tri([0, 0.06, -0.3], [0.08, 0, 0.2], [-0.08, 0, 0.2], white, white, white, 0, 0, 0);
  for (const s of [-1, 1]) {
    // inner wing
    tri([0, 0, -0.12], [s * 0.55, 0.02, -0.05], [0, 0, 0.14], grey, grey, white, 0, 0.5, 0);
    tri([s * 0.55, 0.02, -0.05], [s * 0.55, 0.02, 0.12], [0, 0, 0.14], grey, grey, white, 0.5, 0.5, 0);
    // outer wing with dark tips
    tri([s * 0.55, 0.02, -0.05], [s * 1.0, 0.0, 0.08], [s * 0.55, 0.02, 0.12], grey, dark, grey, 0.5, 1, 0.5);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(P), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(C), 3));
  g.setAttribute('aWing', new BufferAttribute(new Float32Array(W), 1));
  g.computeVertexNormals();
  return g;
}

export type Birds = { mesh: InstancedMesh; update(time: number): void };

export function createBirds(centres: Array<{ x: number; y: number }>, count = 10, opts: { low?: boolean } = {}): Birds {
  const uniforms = { uTime: { value: 0 } };
  const mat = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aWing;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float ph = float(gl_InstanceID) * 1.7;
        // flap in bursts, then glide
        float flap = sin(uTime * 9.0 + ph) * (0.5 + 0.5 * sign(sin(uTime * 0.7 + ph)));
        transformed.y += aWing * aWing * flap * 0.45 + aWing * 0.08;`
      );
  };
  const mesh = new InstancedMesh(gullGeometry(), mat, count);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const gulls: Gull[] = Array.from({ length: count }, (_, i) => {
    const c = centres[i % centres.length]!;
    return opts.low ? { cx: c.x, cy: c.y, r: 5 + rnd() * 6, h: 4 + rnd() * 5, w: 0.5 + rnd() * 0.3, a: rnd() * 6.28, dir: rnd() > 0.5 ? 1 : -1 } : { cx: c.x + (rnd() - 0.5) * 40, cy: c.y + (rnd() - 0.5) * 40, r: 18 + rnd() * 40, h: 12 + rnd() * 18, w: 0.18 + rnd() * 0.14, a: rnd() * 6.28, dir: rnd() > 0.5 ? 1 : -1 };
  });
  const m = new Matrix4();
  const q = new Quaternion();
  const bank = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const fwd = new Vector3(0, 0, 1);
  const p = new Vector3();
  const sc = new Vector3(1.6, 1.6, 1.6);
  return {
    mesh,
    update(time) {
      uniforms.uTime.value = time;
      gulls.forEach((g, i) => {
        const a = g.a + time * g.w * g.dir;
        const x = g.cx + Math.cos(a) * g.r;
        const y = g.cy + Math.sin(a) * g.r;
        p.set(x, g.h + Math.sin(time * 0.5 + i) * 1.5, -y);
        // heading along the circle's tangent
        const tx = -Math.sin(a) * g.dir;
        const ty = Math.cos(a) * g.dir;
        q.setFromAxisAngle(up, Math.atan2(tx, -ty) + Math.PI);
        bank.setFromAxisAngle(fwd, 0.35 * g.dir);
        q.multiply(bank);
        m.compose(p, q, sc);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
