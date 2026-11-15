import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { NO_GO, initialState, polar, step } from '../../src/shared/core/boat';
import { GUN_TICK, TICK_HZ } from '../../src/shared/core/fixed';
import { InputRecorder, decodeInputs, encodeInputs } from '../../src/shared/core/inputs';
import { DEFAULT_PILOT, Pilot } from '../../src/shared/core/pilot';
import { simulate } from '../../src/shared/core/simulate';
import { ANG, bearing, cosA, deg, sinA } from '../../src/shared/core/trig';
import { COURSES, SANDBAR_SPRINT } from '../../src/shared/content/courses';

/** Sail a course with the autopilot and return the recorded input log. */
function pilotLog(course = SANDBAR_SPRINT, opts = DEFAULT_PILOT) {
  const s = initialState(course);
  const pilot = new Pilot(course, opts);
  const rec = new InputRecorder();
  while ((s.phase === 'prestart' || s.phase === 'racing') && s.tick < 20_000) {
    const input = pilot.next(s);
    rec.record(s.tick, input);
    step(s, course, input);
  }
  return { log: rec.log, state: s };
}

describe('trig', () => {
  it('matches Math.sin/cos within one Q14 step', () => {
    for (let a = 0; a < ANG; a += 7) {
      const r = (a / ANG) * 2 * Math.PI;
      expect(Math.abs(sinA(a) - Math.sin(r) * 16384)).toBeLessThanOrEqual(1);
      expect(Math.abs(cosA(a) - Math.cos(r) * 16384)).toBeLessThanOrEqual(1);
    }
  });
  it('bearing matches compass atan2 within 2 units', () => {
    for (let i = 0; i < 2000; i++) {
      const dx = Math.round(Math.sin(i * 1.7) * 90000);
      const dy = Math.round(Math.cos(i * 2.3) * 90000);
      if (dx === 0 && dy === 0) continue;
      const want = ((Math.atan2(dx, dy) / (2 * Math.PI)) * ANG + ANG) % ANG;
      let diff = Math.abs(bearing(dx, dy) - want);
      if (diff > ANG / 2) diff = ANG - diff;
      expect(diff).toBeLessThanOrEqual(2);
    }
  });
});

describe('polar: tactics emerge from the speed table', () => {
  const vmg = (a: number) => polar(a) * Math.cos((a / ANG) * 2 * Math.PI);
  it('best upwind progress is at 48-52 degrees', () => {
    let best = 0;
    for (let a = deg(30); a <= deg(90); a++) if (vmg(a) > vmg(best)) best = a;
    expect(best).toBeGreaterThanOrEqual(deg(48));
    expect(best).toBeLessThanOrEqual(deg(52));
  });
  it('best downwind progress is at 145-155 degrees, faster than a dead run', () => {
    let best = deg(90);
    for (let a = deg(90); a <= deg(180); a++) if (-vmg(a) > -vmg(best)) best = a;
    expect(best).toBeGreaterThanOrEqual(deg(145));
    expect(best).toBeLessThanOrEqual(deg(155));
    expect(-vmg(best)).toBeGreaterThan(-vmg(deg(180)));
  });
  it('the cone stops the boat', () => {
    expect(polar(0)).toBeLessThan(0);
    expect(polar(NO_GO - 2)).toBeLessThan(0);
  });
});

describe('race', () => {
  it('the autopilot finishes every course in 45-100 s, with tacks', () => {
    for (const course of COURSES) {
      for (const firstSide of [-1, 1] as const) {
        const { state } = pilotLog(course, { ...DEFAULT_PILOT, firstSide });
        expect(state.phase, `${course.id} side ${firstSide}`).toBe('finished');
        const secs = (state.finishTick - GUN_TICK) / TICK_HZ;
        expect(secs).toBeGreaterThan(45);
        expect(secs).toBeLessThan(100);
        expect(state.tacks).toBeGreaterThan(0);
      }
    }
  });

  it('replays exactly from the encoded log', () => {
    const { log, state } = pilotLog();
    const decoded = decodeInputs(encodeInputs(log));
    expect(decoded).toEqual(log);
    const r = simulate(SANDBAR_SPRINT, decoded!);
    expect(r.finished).toBe(true);
    expect(r.ticks).toBe(state.finishTick - GUN_TICK + state.penalty);
    expect(r.route).toHaveLength(32);
    expect(encodeInputs(log).length).toBeLessThan(1400);
  });

  it('a boat that never steers does not finish and does not crash', () => {
    const r = simulate(SANDBAR_SPRINT, []);
    expect(r.finished).toBe(false);
  });

  it('any input log is safe to simulate (no crash, no NaN)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ dt: fc.integer({ min: 0, max: 200 }), steer: fc.integer({ min: -16, max: 16 }), tack: fc.boolean() }), { maxLength: 120 }),
        (raw) => {
          let t = 0;
          const log = raw.map((e) => ({ t: (t += e.dt), steer: e.steer, tack: e.tack }));
          const decoded = decodeInputs(encodeInputs(log));
          expect(decoded).not.toBeNull();
          let ok = true;
          simulate(SANDBAR_SPRINT, decoded!, (s) => {
            if (!Number.isInteger(s.x) || !Number.isInteger(s.y) || !Number.isInteger(s.v)) ok = false;
          });
          expect(ok).toBe(true);
        }
      ),
      { numRuns: 60 }
    );
  });

  it('rejects malformed logs', () => {
    expect(decodeInputs('')).toBeNull();
    expect(decodeInputs('!!!')).toBeNull();
    expect(decodeInputs('Ag')).toBeNull();
  });
});

describe('skills', () => {
  const course = { ...SANDBAR_SPRINT };
  it('a perfect tack keeps more speed than a plain one', () => {
    const run = (perfect: boolean) => {
      const s = initialState(course);
      for (let t = 0; t < 200; t++) step(s, course, { steer: 0, tack: false });
      step(s, course, { steer: 0, tack: true });
      let tapped = false;
      for (let t = 0; t < 120; t++) {
        const twa = Math.abs(((s.h - s.windFrom + 6144) % 4096) - 2048);
        const tap = perfect && !tapped && twa < 120;
        if (tap) tapped = true;
        step(s, course, { steer: 0, tack: tap });
        if (s.ev & 1) return { v: s.v, perfects: s.perfects };
      }
      return { v: 0, perfects: -1 };
    };
    const plain = run(false);
    const good = run(true);
    expect(good.perfects).toBe(1);
    expect(plain.perfects).toBe(0);
    expect(good.v).toBeGreaterThan(plain.v);
  });
  it('a shoal on the line takes a second off', () => {
    const { log } = pilotLog();
    const plain = simulate(SANDBAR_SPRINT, log);
    const route = plain.route.map(([x, y]) => ({ x: x / 10, y: y / 10 }));
    const withShoal = { ...SANDBAR_SPRINT, shoals: [route[12]!] };
    const r = simulate(withShoal, log);
    expect(r.ticks).toBe(plain.ticks - 30);
  });
  it('a current pushes a drifting boat', () => {
    const c2 = { ...SANDBAR_SPRINT, currents: [{ x: 200, y: 49, r: 60, dir: deg(90), speed: 8 }] };
    const a = initialState(SANDBAR_SPRINT);
    const b = initialState(c2);
    for (let t = 0; t < 60; t++) {
      step(a, SANDBAR_SPRINT, { steer: 0, tack: false });
      step(b, c2, { steer: 0, tack: false });
    }
    expect(b.x).toBeGreaterThan(a.x + 1_000_000);
  });
});
