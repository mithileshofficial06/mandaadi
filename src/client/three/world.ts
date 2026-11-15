// World mapping and the land shape shared by the water, islands and coast.
// Course space: metres, x east, y north. three.js space: x east, y up, z south (so north is -z).
import { Vector3 } from 'three';
import type { Course } from '../../shared/core/course';

export const toWorld = (x: number, y: number, h = 0, out = new Vector3()): Vector3 => out.set(x, h, -y);

/** Compass heading (radians, 0 = north, clockwise) to a three.js rotation.y. */
export const headingToRotY = (rad: number): number => -rad;

/** Decorative mainland beyond the racing area (boats never reach it: the course box ends at -60). */
export const MAINLAND = { x: -560, y: 90, r: 478 };

export type LandShape = { circles: Array<{ x: number; y: number; r: number }> };

export function landOf(course: Course): LandShape {
  const circles = course.islands.flatMap((i) => i.parts.map((p) => ({ x: p.x, y: p.y, r: p.r })));
  circles.push(MAINLAND);
  return { circles };
}

/**
 * Signed distance to land in metres (negative inside). A smooth union (k = 4 m) so circles
 * blend into one natural outline instead of a cluster of bubbles.
 */
export function landSdf(land: LandShape, x: number, y: number): number {
  let d = 1e9;
  const k = 4;
  for (const c of land.circles) {
    const di = Math.hypot(x - c.x, y - c.y) - c.r;
    // polynomial smooth min
    const h = Math.max(k - Math.abs(d - di), 0) / k;
    d = Math.min(d, di) - h * h * k * 0.25;
  }
  return d;
}

/** Underwater shoals: shallow sandy patches with no land, so the sea has real depth variation. */
export const SHOALS = [
  { x: 120, y: 170, r: 95, depth: 0.32 },
  { x: 330, y: 262, r: 70, depth: 0.3 },
  { x: 262, y: 20, r: 80, depth: 0.55 },
  { x: 200, y: 330, r: 60, depth: 0.6 },
  { x: -10, y: 60, r: 90, depth: 0.4 },
];

/** Area covered by the land/depth texture. */
export const SDF_RECT = { x0: -220, y0: -220, size: 840, res: 512 };
