// The wind: same for everyone, a pure function of the course, position and tick.
import type { Course, Puff } from './course';
import { Q10, TICK_HZ, UM_PER_M, UM_PER_MM, fdiv, isqrt, muldiv, rdiv } from './fixed';
import { ANG, HALF, Q14, cosA, sinA } from './trig';

/** Direction the wind blows from at this tick (angle units). */
export function windFrom(course: Course, tick: number): number {
  const w = course.wind;
  if (w.shiftAmp === 0 || w.shiftPeriod <= 0) return w.from;
  const phase = Math.floor(((tick % w.shiftPeriod) * ANG) / w.shiftPeriod);
  return w.from + rdiv(w.shiftAmp * sinA(phase), Q14);
}

/** Centre of a puff at this tick, in micrometres. Puffs drift downwind with the base wind. */
export function puffCentre(course: Course, p: Puff, tick: number): { x: number; y: number } {
  const to = course.wind.from + HALF;
  // drift is in dm/s; distance travelled in um = drift * 100000 * tick / 30
  const travelled = muldiv(p.drift * 100_000, tick, TICK_HZ);
  return {
    x: p.x * UM_PER_M + muldiv(travelled, sinA(to), Q14),
    y: p.y * UM_PER_M + muldiv(travelled, cosA(to), Q14),
  };
}

/** Local wind factor (Q10) at a point in micrometres: product of all puffs and lulls. */
export function windFactor(course: Course, x: number, y: number, tick: number): number {
  let f = Q10;
  for (const p of course.puffs) {
    const c = puffCentre(course, p, tick);
    const dx = fdiv(x - c.x, UM_PER_MM);
    const dy = fdiv(y - c.y, UM_PER_MM);
    const rMm = p.r * 1000;
    if (dx > rMm || dx < -rMm || dy > rMm || dy < -rMm) continue;
    const d = isqrt(dx * dx + dy * dy);
    if (d >= rMm) continue;
    // k% at the centre, 100% at the edge, linear in between.
    const centre = rdiv(p.k * Q10, 100);
    const local = Q10 + muldiv(centre - Q10, rMm - d, rMm);
    f = rdiv(f * local, Q10);
  }
  return f;
}
