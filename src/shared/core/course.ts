// Course format. Everything is authored in whole metres inside a 400 x 400 m box, x east, y north.
// Angles use the compass units of trig.ts. A course is small (< 1.5 KB as JSON) and fully
// determines a race together with the input log.

export type RaceType = 'light' | 'windward' | 'shifty' | 'tide' | 'storm' | 'community' | 'cup';

export type Pt = { x: number; y: number };

/** A line between two marks (start or finish). */
export type Gate = { a: Pt; b: Pt };

/** A rounding mark. 'port' means the mark stays on the boat's left (anticlockwise around it). */
export type Mark = Pt & { round: 'port' | 'starboard' };

/** An island is a union of circles: smooth, natural outlines and exact, cheap collisions. */
export type Island = { parts: Array<Pt & { r: number }>; palms: number };

/**
 * A pressure patch. k is the wind factor at the centre in percent (130 = gust, 80 = lull),
 * fading linearly to 100 at radius r. It drifts downwind at `drift` decimetres per second.
 */
export type Puff = Pt & { r: number; k: number; drift: number };

export type Wind = {
  /** Direction the wind blows FROM, in angle units. */
  from: number;
  /** 0 light, 1 medium, 2 strong. */
  strength: 0 | 1 | 2;
  /** Oscillating shift: amplitude in angle units and period in ticks (0 = steady). */
  shiftAmp: number;
  shiftPeriod: number;
};

export type Course = {
  id: string;
  name: string;
  type: RaceType;
  wind: Wind;
  start: Gate;
  marks: Mark[];
  finish: Gate;
  islands: Island[];
  puffs: Puff[];
};

export const COURSE_SIZE_M = 400;
/** Max boat speed (m/s x10) by wind strength. */
export const VMAX_10 = [50, 70, 90] as const;
/** A mark counts as rounded after sweeping this far around it while inside ROUND_RADIUS. */
export const ROUND_SWEEP = 2276; // 200 degrees
export const ROUND_RADIUS_M = 70;
/** Boat collision radius against islands. */
export const BOAT_RADIUS_M = 2;
