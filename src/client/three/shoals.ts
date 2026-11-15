// Fish shoals: a patch of ruffled, boiling water with silver flicks and gulls diving over it.
// Hauled shoals calm down and the gulls leave. Cheap: one flat shader disc each + shared gulls.
import { Group, Mesh, PlaneGeometry, ShaderMaterial } from 'three';
import type { Shoal } from '../../shared/core/course';
import { createBirds } from './birds';

export type Shoals = { group: Group; take(mask: number): void; update(t: number): void };

export function createShoals(list: Shoal[]): Shoals {
  const group = new Group();
  const mats: ShaderMaterial[] = [];
  for (const f of list) {
    const mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uLive: { value: 1 } },
      vertexShader: `varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec2 vP; uniform float uTime; uniform float uLive;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        void main(){
          float r = length(vP) / 7.0;
          if (r > 1.0) discard;
          vec2 c = floor(vP * 1.6);
          float k = h(c);
          float flick = step(0.93, fract(k * 13.0 + uTime * (0.6 + k))) * step(0.35, k);
          float rip = 0.5 + 0.5 * sin(r * 22.0 - uTime * 5.0);
          float edge = 1.0 - smoothstep(0.75, 1.0, r);
          float a = (rip * 0.18 + flick * 0.85) * edge * uLive;
          gl_FragColor = vec4(vec3(0.85, 0.95, 1.0), a);
        }`,
    });
    const geo = new PlaneGeometry(14, 14);
    geo.rotateX(-Math.PI / 2);
    const m = new Mesh(geo, mat);
    m.position.set(f.x, 0.08, -f.y);
    m.renderOrder = 3;
    group.add(m);
    mats.push(mat);
  }
  const birds = createBirds(list, Math.min(8, list.length * 3), { low: true });
  group.add(birds.mesh);
  let taken = 0;
  return {
    group,
    take(mask) {
      taken = mask;
    },
    update(t) {
      mats.forEach((m, i) => {
        m.uniforms.uTime!.value = t;
        const live = (taken & (1 << i)) === 0 ? 1 : 0;
        m.uniforms.uLive!.value += (live - m.uniforms.uLive!.value) * 0.05;
      });
      birds.update(t);
      birds.mesh.visible = taken !== (1 << list.length) - 1;
    },
  };
}
