import { BufferAttribute, type BufferGeometry, Color, type Group, type Material, Matrix4, type Mesh } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Merge every mesh under `g` into one vertex-coloured geometry (one draw call). Each part keeps
 * its own colour: from its colour attribute if it has one, otherwise from its material.
 */
export function bake(g: Group): BufferGeometry {
  g.updateMatrixWorld(true);
  const inv = new Matrix4().copy(g.matrixWorld).invert();
  const parts: BufferGeometry[] = [];
  g.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    geo.applyMatrix4(new Matrix4().multiplyMatrices(inv, m.matrixWorld));
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    if (!geo.getAttribute('color')) {
      const c = ((m.material as Material & { color?: Color }).color ?? new Color('#ffffff')) as Color;
      const n = geo.getAttribute('position').count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new BufferAttribute(col, 3));
    }
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') geo.deleteAttribute(k);
    geo = geo.index ? geo.toNonIndexed() : geo;
    parts.push(geo);
  });
  return mergeGeometries(parts, false)!;
}
