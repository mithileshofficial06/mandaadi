// Integer trigonometry. Angles are in units of 1/4096 of a full turn and follow the compass:
// 0 = north (+y), 1024 = east (+x), clockwise. sin/cos return Q14 (16384 = 1.0).
import { ATAN_Q, SIN_Q } from './trigTable';

export const ANG = 4096;
export const HALF = 2048;
export const QUARTER = 1024;
export const Q14 = 16384;

/** Degrees to angle units (rounded). For constants and course authoring only. */
export const deg = (d: number): number => Math.round((d * ANG) / 360);

/** Wrap to [0, 4096). */
export function wrapA(a: number): number {
  return ((a % ANG) + ANG) % ANG;
}

/** Wrap to [-2048, 2048). */
export function signedA(a: number): number {
  return wrapA(a + HALF) - HALF;
}

export function sinA(a: number): number {
  const w = wrapA(a);
  const q = w >> 10; // quadrant 0..3
  const i = w & 1023;
  switch (q) {
    case 0:
      return SIN_Q[i]!;
    case 1:
      return SIN_Q[QUARTER - i]!;
    case 2:
      return -SIN_Q[i]!;
    default:
      return -SIN_Q[QUARTER - i]!;
  }
}

export function cosA(a: number): number {
  return sinA(a + QUARTER);
}

/**
 * Compass bearing of the vector (dx east, dy north), in angle units [0, 4096).
 * Inputs must be integers with |dx|, |dy| < 2^42 (use millimetres, not micrometres).
 */
export function bearing(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return 0;
  const ax = dx < 0 ? -dx : dx;
  const ay = dy < 0 ? -dy : dy;
  // Angle from the north axis towards east, 0..1024, within the first quadrant.
  const base = ax <= ay ? ATAN_Q[Math.floor((ax * 1024) / ay)]! : QUARTER - ATAN_Q[Math.floor((ay * 1024) / ax)]!;
  if (dx >= 0) return dy >= 0 ? base : HALF - base;
  return dy < 0 ? HALF + base : wrapA(ANG - base);
}
