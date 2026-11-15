// A simple autopilot: beats upwind to the layline, rounds marks the right way, gybes downwind.
// Used by tests, the course checker, and as the Harbourmaster ghost until the solver lands.
// It only produces inputs; the simulation stays the single source of truth.
import { type BoatState, type TickInput, TUNE } from './boat';
import type { Course } from './course';
import { UM_PER_M, UM_PER_MM, clamp, fdiv, iabs, isqrt, rdiv } from './fixed';
import { Q14, bearing, cosA, deg, signedA, sinA, wrapA } from './trig';

export type PilotOpts = {
  /** Sailing angles. */
  up: number;
  down: number;
  /** Tack only once the target is this far past the other tack's angle (0 = exactly on the layline). */
  overstand: number;
  /** Which tack to prefer at the start: -1 (left side of the course) or 1 (right). */
  firstSide: -1 | 1;
};

export const DEFAULT_PILOT: PilotOpts = { up: deg(50), down: deg(150), overstand: deg(3), firstSide: 1 };

export class Pilot {
  private startSideDone = false;
  constructor(
    private readonly course: Course,
    private readonly o: PilotOpts = DEFAULT_PILOT
  ) {}

  private target(s: BoatState): { x: number; y: number } {
    const c = this.course;
    if (s.leg < c.marks.length) {
      const m = c.marks[s.leg]!;
      const mx = m.x * UM_PER_M;
      const my = m.y * UM_PER_M;
      const dx = fdiv(s.x - mx, UM_PER_MM);
      const dy = fdiv(s.y - my, UM_PER_MM);
      const d = isqrt(dx * dx + dy * dy);
      if (d < 26_000) {
        // Follow a carrot around the mark at 11 m, ahead in the rounding direction.
        const b = bearing(dx, dy);
        const ahead = m.round === 'port' ? b - deg(70) : b + deg(70);
        return { x: mx + rdiv(11 * UM_PER_M * sinA(ahead), Q14), y: my + rdiv(11 * UM_PER_M * cosA(ahead), Q14) };
      }
      // Aim to pass 9 m on the correct side.
      const toMark = bearing(-dx, -dy);
      const side = m.round === 'port' ? toMark + deg(90) : toMark - deg(90);
      return { x: mx + rdiv(9 * UM_PER_M * sinA(side), Q14), y: my + rdiv(9 * UM_PER_M * cosA(side), Q14) };
    }
    const f = c.finish;
    return { x: ((f.a.x + f.b.x) / 2) * UM_PER_M, y: ((f.a.y + f.b.y) / 2) * UM_PER_M };
  }

  /** Is there land (or the edge of the course) within `metres` straight ahead? */
  private landAhead(s: BoatState, metres: number): boolean {
    for (let d = 4; d <= metres; d += 3) {
      const x = s.x + rdiv(d * UM_PER_M * sinA(s.h), Q14);
      const y = s.y + rdiv(d * UM_PER_M * cosA(s.h), Q14);
      for (const isl of this.course.islands) {
        for (const p of isl.parts) {
          const dx = fdiv(x - p.x * UM_PER_M, UM_PER_MM);
          const dy = fdiv(y - p.y * UM_PER_M, UM_PER_MM);
          const r = (p.r + 5) * 1000;
          if (dx * dx + dy * dy < r * r) return true;
        }
      }
    }
    return false;
  }

  next(s: BoatState): TickInput {
    const w = s.windFrom;
    const t = this.target(s);
    const want = bearing(fdiv(t.x - s.x, UM_PER_MM), fdiv(t.y - s.y, UM_PER_MM));
    const twaWant = signedA(want - w);
    const twaNow = signedA(s.h - w);
    const sideNow = twaNow >= 0 ? 1 : -1;
    let desired = want;
    let tack = false;

    if (iabs(twaWant) < this.o.up) {
      // Beating. Hold the current tack's close-hauled angle until the target is past the layline.
      let side = sideNow;
      if (!this.startSideDone && s.phase === 'racing') {
        this.startSideDone = true;
        // firstSide 1 = go right = port tack (wind on the left, heading right of the wind).
        if (side !== this.o.firstSide) {
          tack = true;
          side = -side;
        }
      } else if (
        (Math.sign(twaWant) !== side && iabs(twaWant) >= this.o.up - this.o.overstand) ||
        this.landAhead(s, 22)
      ) {
        tack = true;
        side = -side;
      }
      desired = wrapA(w + side * this.o.up);
    } else if (iabs(twaWant) > this.o.down) {
      let side = sideNow;
      if (Math.sign(twaWant) !== side && iabs(twaWant) <= this.o.down + this.o.overstand) {
        tack = true;
        side = -side;
      }
      desired = wrapA(w + side * this.o.down);
    }
    if (s.tackTo >= 0) return { steer: 0, tack: false };
    if (tack && iabs(signedA(desired - s.h)) > deg(40)) return { steer: 0, tack: true };
    const err = signedA(desired - s.h);
    return { steer: clamp(rdiv(err, 3), -TUNE.STEER_MAX, TUNE.STEER_MAX), tack: false };
  }
}
