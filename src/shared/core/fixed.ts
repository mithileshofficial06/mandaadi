// Deterministic integer helpers and the race's global constants.
// RULE: everything in src/shared/core uses integers only. No Math.sin/cos/atan/exp/pow/log,
// no Date, no Math.random. Basic IEEE ops (+ - * / sqrt, floor) are exact and identical on
// every engine, so integer maths built from them replays bit-for-bit on phone and server.

/** Simulation rate. Client and server both step the boat at exactly this rate. */
export const TICK_HZ = 30;
/** Start countdown: the gun fires at this tick (3 s). Race time is measured from the gun. */
export const GUN_TICK = 90;
/** Hard cap on a race, countdown included (3 minutes of racing). */
export const MAX_TICKS = GUN_TICK + 5400;
/** Hard cap on input-log entries. */
export const MAX_ENTRIES = 4000;

/** Positions are in micrometres (1 m = 1,000,000). Geometry is done in millimetres. */
export const UM_PER_M = 1_000_000;
export const UM_PER_MM = 1000;
/** Speeds are in micrometres per tick. 1 m/s = 33,333 um/tick. */
export const umPerTick = (metresPerSecond10: number): number => rdiv(metresPerSecond10 * UM_PER_M, 10 * TICK_HZ);

/** Q10 fixed point: 1024 = 1.0. Used for speed shares and wind factors. */
export const Q10 = 1024;

/** Integer division rounded half up. b must be > 0. */
export function rdiv(a: number, b: number): number {
  return Math.floor((2 * a + b) / (2 * b));
}

/** Integer division rounded down. b must be > 0. */
export function fdiv(a: number, b: number): number {
  return Math.floor(a / b);
}

/** floor(a * b / c), c > 0. Exact while |a * b| < 2^53. */
export function muldiv(a: number, b: number, c: number): number {
  return Math.floor((a * b) / c);
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function iabs(x: number): number {
  return x < 0 ? -x : x;
}

export function isign(x: number): number {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
}

/** Integer square root (floor), exact for 0 <= n < 2^52. */
export function isqrt(n: number): number {
  if (n <= 0) return 0;
  let r = Math.floor(Math.sqrt(n));
  while (r * r > n) r--;
  while ((r + 1) * (r + 1) <= n) r++;
  return r;
}

/** Distance in millimetres between two points given in micrometres. */
export function distMm(ax: number, ay: number, bx: number, by: number): number {
  const dx = fdiv(ax - bx, UM_PER_MM);
  const dy = fdiv(ay - by, UM_PER_MM);
  return isqrt(dx * dx + dy * dy);
}
