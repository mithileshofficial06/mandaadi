// The boat model and the race rules: one 30 Hz tick. Identical on the phone and the server.
// Integers only (see fixed.ts). All tuning numbers live in TUNE so feel can be adjusted in one place.
import { BOAT_RADIUS_M, type Course, type Gate, type Mark, ROUND_RADIUS_M, ROUND_SWEEP, SHOAL_BONUS, SHOAL_RADIUS_M, VMAX_10 } from './course';
import { GUN_TICK, MAX_TICKS, Q10, UM_PER_M, UM_PER_MM, clamp, fdiv, iabs, isqrt, muldiv, rdiv, umPerTick } from './fixed';
import { HALF, QUARTER, Q14, bearing, cosA, deg, signedA, sinA, wrapA } from './trig';
import { windFactor, windFrom } from './wind';

export const TUNE = {
  /** Max rudder input magnitude (input steer is -STEER_MAX..STEER_MAX). */
  STEER_MAX: 16,
  /** Turn rate at full rudder and full speed, in angle units per tick (24 = about 63 deg/s). */
  TURN_MAX: 24,
  /** Turn rate share at zero speed (Q10). Boats steer with water flow, but never get stuck. */
  TURN_MIN_SHARE: 560,
  /** Auto-tack never turns slower than this share (Q10). */
  TACK_TURN_SHARE: 900,
  /** Speed lag divisors per tick: accelerating, slowing, and coasting head-to-wind. */
  LAG_UP: 40,
  LAG_DOWN: 26,
  LAG_IRONS: 72,
  /** Speed kept when the bow crosses the wind (tack) or the stern does (gybe), Q10. */
  TACK_KEEP: 840,
  /** A perfect tack (tap again as the bow crosses the wind) keeps this much. */
  PERFECT_KEEP: 975,
  /** The perfect-tack window: within this angle of head-to-wind. */
  PERFECT_WINDOW: 137,
  GYBE_KEEP: 900,
  /** Speed lost per tick at full rudder, in 1/100000 of speed. */
  RUDDER_DRAG: 290,
  /** Island contact penalty (ticks). */
  HIT_PENALTY: 60,
  /** Gusts cap the target speed at this share of max (Q10). */
  GUST_CAP: 1434,
} as const;

/** Polar: target speed share (Q10) by angle to the wind (angle units, 0..2048). Linear between points. */
export const POLAR: ReadonlyArray<readonly [number, number]> = [
  [0, -31],
  [deg(38), -31],
  [deg(41), 580],
  [deg(45), 635],
  [deg(50), 717],
  [deg(60), 870],
  [deg(90), 1024],
  [deg(120), 973],
  [deg(150), 819],
  [deg(165), 696],
  [deg(180), 635],
];

/** Where the boat stops making way: the edge of the red cone. */
export const NO_GO = deg(38);

export function polar(angle: number): number {
  const a = clamp(angle, 0, HALF);
  for (let i = 1; i < POLAR.length; i++) {
    const [a1, v1] = POLAR[i]!;
    if (a <= a1) {
      const [a0, v0] = POLAR[i - 1]!;
      if (a1 === a0) return v1;
      return v0 + rdiv((v1 - v0) * (a - a0), a1 - a0);
    }
  }
  return POLAR[POLAR.length - 1]![1];
}

/** Bit flags for things that happened during a tick (sound, haptics, HUD). */
export const EV = {
  TACK: 1,
  GYBE: 2,
  ROUND: 4,
  HIT: 8,
  GUN: 16,
  START: 32,
  EARLY: 64,
  CLEAR: 128,
  FINISH: 256,
  TOUCH_MARK: 512,
  PERFECT: 1024,
  SHOAL: 2048,
  EARLY_TAP: 4096,
} as const;

export type Phase = 'prestart' | 'racing' | 'finished' | 'dnf';

export type BoatState = {
  tick: number;
  /** Position (micrometres), heading (angle units), speed (um/tick; negative = drifting back). */
  x: number;
  y: number;
  h: number;
  v: number;
  /** Current rudder input. */
  steer: number;
  /** Auto-tack target heading, or -1. */
  tackTo: number;
  phase: Phase;
  started: boolean;
  early: boolean;
  /** Index of the next mark; marks.length means "go to the finish". */
  leg: number;
  sweep: number;
  inZone: boolean;
  prevAng: number;
  onLand: boolean;
  penalty: number;
  hits: number;
  tacks: number;
  finishTick: number;
  perfectArmed: boolean;
  perfects: number;
  /** Bitmask of shoals hauled, and the bonus ticks earned. */
  shoals: number;
  bonus: number;
  /** Events from the last tick (EV flags). */
  ev: number;
  /** Local wind factor at the boat (Q10) and wind direction, for the HUD. */
  wind: number;
  windFrom: number;
};

export type TickInput = { steer: number; tack: boolean };

const mm = (m: number) => m * 1000;

/** Side of point p (um) relative to gate a->b: sign of the cross product, in mm units. */
function gateSide(g: Gate, px: number, py: number): number {
  const ax = mm(g.a.x);
  const ay = mm(g.a.y);
  const c = (mm(g.b.x) - ax) * (fdiv(py, UM_PER_MM) - ay) - (mm(g.b.y) - ay) * (fdiv(px, UM_PER_MM) - ax);
  return c > 0 ? 1 : c < 0 ? -1 : 0;
}

/** Side of the gate where a point (metres) lies. */
function gateSideM(g: Gate, p: { x: number; y: number }): number {
  return gateSide(g, p.x * UM_PER_M, p.y * UM_PER_M);
}

/** Does the segment p0->p1 (um) cross the gate segment? */
function crossesGate(g: Gate, x0: number, y0: number, x1: number, y1: number): boolean {
  const s0 = gateSide(g, x0, y0);
  const s1 = gateSide(g, x1, y1);
  if (s0 === s1 || s1 === 0) return false;
  // The gate's ends must lie on opposite sides of the path.
  const px0 = fdiv(x0, UM_PER_MM);
  const py0 = fdiv(y0, UM_PER_MM);
  const dx = fdiv(x1, UM_PER_MM) - px0;
  const dy = fdiv(y1, UM_PER_MM) - py0;
  const ca = dx * (mm(g.a.y) - py0) - dy * (mm(g.a.x) - px0);
  const cb = dx * (mm(g.b.y) - py0) - dy * (mm(g.b.x) - px0);
  return (ca >= 0 && cb <= 0) || (ca <= 0 && cb >= 0);
}

/** The side of the start line the first mark is on (the course side). */
export function courseSide(course: Course): number {
  const first = course.marks[0] ?? course.finish.a;
  return gateSideM(course.start, first) || 1;
}

/** The side of the finish line the boat must end on (away from the last mark). */
export function finishSide(course: Course): number {
  const last = course.marks[course.marks.length - 1] ?? course.start.a;
  return -(gateSideM(course.finish, last) || 1);
}

export function vmax(course: Course): number {
  return umPerTick(VMAX_10[course.wind.strength]);
}

/** Starting position: behind the middle of the start line, close-hauled on starboard, moving. */
export function initialState(course: Course): BoatState {
  const g = course.start;
  const midX = ((g.a.x + g.b.x) / 2) * UM_PER_M;
  const midY = ((g.a.y + g.b.y) / 2) * UM_PER_M;
  // Unit normal towards the pre-start side.
  const nx0 = -(g.b.y - g.a.y);
  const ny0 = g.b.x - g.a.x;
  const len = isqrt(nx0 * nx0 * 1_000_000 + ny0 * ny0 * 1_000_000); // in mm units
  const pre = -courseSide(course);
  // gateSide uses cross((b-a),(p-a)); a positive normal (nx0, ny0) points to side +1.
  const back = 11 * UM_PER_M;
  const x = Math.round(midX + (pre * back * nx0 * 1000) / len);
  const y = Math.round(midY + (pre * back * ny0 * 1000) / len);
  const w = course.wind.from;
  const h = wrapA(w - deg(48));
  const v = rdiv(muldiv(vmax(course), polar(deg(48)), Q10) * 4, 5);
  return {
    tick: 0,
    x,
    y,
    h,
    v,
    steer: 0,
    tackTo: -1,
    phase: 'prestart',
    started: false,
    early: false,
    leg: 0,
    sweep: 0,
    inZone: false,
    prevAng: 0,
    onLand: false,
    penalty: 0,
    hits: 0,
    tacks: 0,
    finishTick: 0,
    perfectArmed: false,
    perfects: 0,
    shoals: 0,
    bonus: 0,
    ev: 0,
    wind: Q10,
    windFrom: w,
  };
}

function pushOut(s: BoatState, cx: number, cy: number, minMm: number): boolean {
  const dx = fdiv(s.x - cx, UM_PER_MM);
  const dy = fdiv(s.y - cy, UM_PER_MM);
  if (iabs(dx) >= minMm || iabs(dy) >= minMm) return false;
  const d2 = dx * dx + dy * dy;
  if (d2 >= minMm * minMm) return false;
  const d = isqrt(d2);
  if (d === 0) {
    s.y = cy + minMm * UM_PER_MM;
  } else {
    s.x = cx + muldiv(dx * UM_PER_MM, minMm, d);
    s.y = cy + muldiv(dy * UM_PER_MM, minMm, d);
  }
  return true;
}

/** Advance one tick. Mutates and returns s. */
export function step(s: BoatState, course: Course, input: TickInput): BoatState {
  s.ev = 0;
  if (s.phase === 'finished' || s.phase === 'dnf') return s;
  const tick = s.tick;
  const vm = vmax(course);
  const w = windFrom(course, tick);
  s.windFrom = w;

  // ---- Steering and the one-tap tack ----
  const twa0 = signedA(s.h - w);
  if (input.tack && s.tackTo < 0) {
    // Mirror the heading across the wind: same angle to the wind on the other side.
    s.tackTo = wrapA(w - twa0);
  } else if (input.tack && s.tackTo >= 0 && !s.perfectArmed && iabs(twa0) < QUARTER) {
    // Second tap during a tack: a "roll tack" if timed as the bow crosses the wind.
    if (iabs(twa0) <= TUNE.PERFECT_WINDOW) s.perfectArmed = true;
    else s.ev |= EV.EARLY_TAP;
  }
  const steer = clamp(input.steer | 0, -TUNE.STEER_MAX, TUNE.STEER_MAX);
  s.steer = steer;
  const speedShare = clamp(muldiv(iabs(s.v), Q10, Math.max(1, rdiv(vm * 6, 10))), 0, Q10);
  let rateShare = TUNE.TURN_MIN_SHARE + muldiv(Q10 - TUNE.TURN_MIN_SHARE, speedShare, Q10);
  let turn: number;
  if (s.tackTo >= 0) {
    rateShare = Math.max(rateShare, TUNE.TACK_TURN_SHARE);
    const rate = Math.max(1, muldiv(TUNE.TURN_MAX, rateShare, Q10));
    // The target is the heading mirrored across the wind, so the shortest turn to it goes through
    // the wind when upwind (a tack) and through dead downwind when running (a gybe). Exactly
    // abeam both ways are equal: tack.
    let diff = signedA(s.tackTo - s.h);
    if (iabs(diff) === HALF) diff = twa0 > 0 ? -HALF : HALF;
    if (iabs(diff) <= rate) {
      turn = diff;
      s.tackTo = -1;
    } else {
      turn = diff > 0 ? rate : -rate;
    }
    // Any firm steering input cancels the auto-tack after it has started.
    if (steer !== 0 && iabs(steer) >= 8 && Math.sign(steer) !== Math.sign(turn)) s.tackTo = -1;
  } else {
    const rate = muldiv(TUNE.TURN_MAX, rateShare, Q10);
    turn = rdiv(steer * rate, TUNE.STEER_MAX);
  }
  s.h = wrapA(s.h + turn);
  if (turn !== 0) s.v -= muldiv(s.v, iabs(turn) * TUNE.RUDDER_DRAG, TUNE.TURN_MAX * 100_000);

  // ---- Tack / gybe detection (sign of the angle to the wind flips) ----
  const twa1 = signedA(s.h - w);
  if (twa0 !== 0 && twa1 !== 0 && Math.sign(twa0) !== Math.sign(twa1)) {
    if (iabs(twa0) < QUARTER && iabs(twa1) < QUARTER) {
      s.v = muldiv(s.v, s.perfectArmed ? TUNE.PERFECT_KEEP : TUNE.TACK_KEEP, Q10);
      s.ev |= EV.TACK;
      if (s.perfectArmed) {
        s.ev |= EV.PERFECT;
        s.perfects++;
      }
      s.perfectArmed = false;
      s.tacks++;
    } else if (iabs(twa0) >= QUARTER && iabs(twa1) >= QUARTER) {
      s.v = muldiv(s.v, TUNE.GYBE_KEEP, Q10);
      s.ev |= EV.GYBE;
    }
  }

  // ---- Speed: polar x local wind, with lag ----
  const a = iabs(twa1);
  const local = windFactor(course, s.x, s.y, tick);
  s.wind = local;
  const share = polar(a);
  let target = muldiv(muldiv(vm, share, Q10), local, Q10);
  const cap = muldiv(vm, TUNE.GUST_CAP, Q10);
  if (target > cap) target = cap;
  const lag = a < NO_GO ? TUNE.LAG_IRONS : target > s.v ? TUNE.LAG_UP : TUNE.LAG_DOWN;
  s.v += fdiv(target - s.v, lag);

  // ---- Move ----
  const x0 = s.x;
  const y0 = s.y;
  s.x += muldiv(s.v, sinA(s.h), Q14);
  s.y += muldiv(s.v, cosA(s.h), Q14);

  // ---- Current: the water itself moves the boat ----
  for (const cu of course.currents ?? []) {
    const dx = fdiv(s.x - cu.x * UM_PER_M, UM_PER_MM);
    const dy = fdiv(s.y - cu.y * UM_PER_M, UM_PER_MM);
    const r = cu.r * 1000;
    if (iabs(dx) >= r || iabs(dy) >= r) continue;
    const d = isqrt(dx * dx + dy * dy);
    if (d >= r) continue;
    const flow = muldiv(muldiv(cu.speed, 100_000, 30), r - d, r); // um per tick
    s.x += muldiv(flow, sinA(cu.dir), Q14);
    s.y += muldiv(flow, cosA(cu.dir), Q14);
  }

  // ---- Islands and marks are solid ----
  let touching = false;
  for (const isl of course.islands) {
    for (const p of isl.parts) {
      if (pushOut(s, p.x * UM_PER_M, p.y * UM_PER_M, mm(p.r + BOAT_RADIUS_M))) touching = true;
    }
  }
  if (touching) {
    if (!s.onLand) {
      s.penalty += TUNE.HIT_PENALTY;
      s.hits++;
      s.ev |= EV.HIT;
      s.v = fdiv(s.v, 4);
    } else {
      // Scraping along the shore: slow, but the boat can slide off.
      s.v -= fdiv(s.v, 12);
    }
  }
  s.onLand = touching;
  for (const m of course.marks) {
    if (pushOut(s, m.x * UM_PER_M, m.y * UM_PER_M, 3000)) {
      s.v = muldiv(s.v, 700, Q10);
      s.ev |= EV.TOUCH_MARK;
    }
  }
  const lo = -60 * UM_PER_M;
  const hi = 460 * UM_PER_M;
  if (s.x < lo || s.x > hi || s.y < lo || s.y > hi) {
    s.x = clamp(s.x, lo, hi);
    s.y = clamp(s.y, lo, hi);
    s.v = fdiv(s.v, 2);
  }

  // ---- Start line ----
  if (tick + 1 === GUN_TICK) s.ev |= EV.GUN;
  if (!s.started && crossesGate(course.start, x0, y0, s.x, s.y)) {
    const toCourse = gateSide(course.start, s.x, s.y) === courseSide(course);
    if (toCourse) {
      if (tick + 1 < GUN_TICK) {
        s.early = true;
        s.ev |= EV.EARLY;
      } else if (!s.early) {
        s.started = true;
        s.phase = 'racing';
        s.ev |= EV.START;
      }
    } else if (s.early) {
      s.early = false;
      s.ev |= EV.CLEAR;
    }
  }

  // ---- Marks, in order ----
  if (s.started && s.leg < course.marks.length) roundMark(s, course.marks[s.leg]!);

  // ---- Fish shoals ----
  if (s.started && course.shoals) {
    const rr = SHOAL_RADIUS_M * 1000;
    course.shoals.forEach((f, i) => {
      if (s.shoals & (1 << i)) return;
      const dx = fdiv(s.x, UM_PER_MM) - mm(f.x);
      const dy = fdiv(s.y, UM_PER_MM) - mm(f.y);
      if (iabs(dx) < rr && iabs(dy) < rr && dx * dx + dy * dy < rr * rr) {
        s.shoals |= 1 << i;
        s.bonus += SHOAL_BONUS;
        s.ev |= EV.SHOAL;
      }
    });
  }

  // ---- Finish ----
  if (s.started && s.leg >= course.marks.length && crossesGate(course.finish, x0, y0, s.x, s.y)) {
    if (gateSide(course.finish, s.x, s.y) === finishSide(course)) {
      s.phase = 'finished';
      s.finishTick = tick + 1;
      s.ev |= EV.FINISH;
    }
  }

  s.tick = tick + 1;
  if (s.phase !== 'finished' && s.tick >= MAX_TICKS) s.phase = 'dnf';
  return s;
}

function roundMark(s: BoatState, m: Mark): void {
  const dx = fdiv(s.x, UM_PER_MM) - mm(m.x);
  const dy = fdiv(s.y, UM_PER_MM) - mm(m.y);
  const r = mm(ROUND_RADIUS_M);
  if (iabs(dx) > r || iabs(dy) > r || dx * dx + dy * dy > r * r) {
    s.inZone = false;
    s.sweep = 0;
    return;
  }
  const ang = bearing(dx, dy);
  if (s.inZone) {
    const d = signedA(ang - s.prevAng);
    // Port rounding = anticlockwise = compass bearing from the mark decreasing.
    s.sweep += m.round === 'port' ? -d : d;
    if (s.sweep >= ROUND_SWEEP) {
      s.leg++;
      s.sweep = 0;
      s.inZone = false;
      s.ev |= EV.ROUND;
      return;
    }
  }
  s.inZone = true;
  s.prevAng = ang;
}

/** Official race time in ticks (from the gun, with penalties). */
export function raceTicks(s: BoatState): number {
  return Math.max(1, s.finishTick - GUN_TICK + s.penalty - s.bonus);
}
