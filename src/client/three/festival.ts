// Festival race day: a committee boat dressed with bunting at the start line and spectator boats
// moored outside the course. One merged mesh plus one bunting mesh that flutters.
import { BufferAttribute, BufferGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshLambertMaterial } from 'three';
import type { Course } from '../../shared/core/course';
import { bake } from './bake';
import { LIVERIES, beachedHull } from './boatModel';

const FLAGS = ['#c8372d', '#f1c232', '#1f5fa8', '#1d7a5c', '#e86a2b', '#f4f1ea', '#8e3a8f'];

/** Triangular pennants hung along the segments of a line (x, y, z points in world space). */
function bunting(points: number[][]): BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  let k = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay, az] = points[i]!;
    const [bx, by, bz] = points[i + 1]!;
    const n = 9;
    for (let j = 0; j < n; j++) {
      const t0 = j / n;
      const t1 = (j + 0.7) / n;
      const sag = (t: number) => -Math.sin(Math.PI * t) * 0.5;
      const p0 = [ax! + (bx! - ax!) * t0, ay! + (by! - ay!) * t0 + sag(t0), az! + (bz! - az!) * t0];
      const p1 = [ax! + (bx! - ax!) * t1, ay! + (by! - ay!) * t1 + sag(t1), az! + (bz! - az!) * t1];
      const mid = [(p0[0]! + p1[0]!) / 2, (p0[1]! + p1[1]!) / 2 - 0.45, (p0[2]! + p1[2]!) / 2];
      pos.push(...p0, ...p1, ...mid);
      const c = FLAGS[k++ % FLAGS.length]!;
      const r = parseInt(c.slice(1, 3), 16) / 255;
      const gg = parseInt(c.slice(3, 5), 16) / 255;
      const b = parseInt(c.slice(5, 7), 16) / 255;
      for (let q = 0; q < 3; q++) col.push(r, gg, b);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  geo.computeVertexNormals();
  return geo;
}

export type Festival = { group: Group; update(t: number): void };

export function createFestival(course: Course): Festival {
  const group = new Group();
  const g = new Group();
  const a = course.start.a;
  const b = course.start.b;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // committee boat just beyond the starboard end of the line, bigger, two masts
  const cx = b.x + ux * 9;
  const cy = b.y + uy * 9;
  const hull = new Mesh(beachedHull(LIVERIES[3]!), new MeshLambertMaterial({ vertexColors: true }));
  hull.scale.setScalar(1.7);
  hull.position.set(cx, 0, -cy);
  hull.rotation.y = -Math.atan2(ux, uy); // bow along the line, so the masts stand on deck
  g.add(hull);
  const mastMat = new MeshLambertMaterial({ color: '#6b4426' });
  const tops: number[][] = [];
  for (const k of [-3, 3]) {
    const m = new Mesh(new CylinderGeometry(0.07, 0.1, 7, 6), mastMat);
    const mx = cx + ux * k;
    const my = cy + uy * k;
    m.position.set(mx, 3.5, -my);
    g.add(m);
    tops.push([mx, 6.8, -my]);
  }
  // spectator boats moored behind the line, facing the wind
  const back = { x: -uy, y: ux }; // perpendicular; pick the side away from the first mark
  const mk = course.marks[0] ?? { x: a.x, y: a.y + 100 };
  const sgn = (mk.x - a.x) * back.x + (mk.y - a.y) * back.y > 0 ? -1 : 1;
  for (let i = 0; i < 5; i++) {
    const t = -0.3 + i * 0.4;
    const sx = a.x + dx * t + back.x * sgn * (34 + (i % 2) * 9);
    const sy = a.y + dy * t + back.y * sgn * (34 + (i % 2) * 9);
    const m = new Mesh(beachedHull(LIVERIES[i % LIVERIES.length]!), new MeshLambertMaterial({ vertexColors: true }));
    m.position.set(sx, 0, -sy);
    m.rotation.y = (course.wind.from / 4096) * -Math.PI * 2 + (i - 2) * 0.15;
    g.add(m);
  }
  group.add(new Mesh(bake(g), new MeshLambertMaterial({ vertexColors: true })));
  // bunting: bow -> foremast -> mainmast -> stern of the committee boat
  const bow = [cx - ux * 5.6, 1.3, -(cy - uy * 5.6)];
  const stern = [cx + ux * 5.6, 1.1, -(cy + uy * 5.6)];
  const flags = new Mesh(bunting([bow, tops[0]!, tops[1]!, stern]), new MeshLambertMaterial({ vertexColors: true, side: DoubleSide }));
  group.add(flags);
  return {
    group,
    update(t) {
      flags.position.y = Math.sin(t * 3.1) * 0.03;
    },
  };
}
