// Hand-made courses. Tier A has one: a Tuesday windward-leeward off a sandbar, wind from the north.
// Both sides pay: the right has an early gust, the left a bigger one that arrives late, past
// the island. The middle sits in a lull.
import type { Course } from '../core/course';
import { deg } from '../core/trig';

export const SANDBAR_SPRINT: Course = {
  id: 'c001',
  name: 'Sandbar Sprint',
  type: 'windward',
  wind: { from: deg(0), strength: 1, shiftAmp: 0, shiftPeriod: 0 },
  start: { a: { x: 168, y: 60 }, b: { x: 232, y: 60 } },
  marks: [{ x: 200, y: 230, round: 'port' }],
  finish: { a: { x: 168, y: 60 }, b: { x: 232, y: 60 } },
  islands: [
    {
      parts: [
        { x: 104, y: 150, r: 20 },
        { x: 88, y: 166, r: 14 },
        { x: 122, y: 140, r: 10 },
      ],
      palms: 5,
    },
    {
      parts: [
        { x: 318, y: 262, r: 9 },
        { x: 328, y: 254, r: 6 },
      ],
      palms: 1,
    },
  ],
  puffs: [
    // Right: there from the start, small.
    { x: 272, y: 150, r: 34, k: 126, drift: 4 },
    // Left: big, arrives late (drifts down from the top left).
    { x: 132, y: 300, r: 48, k: 138, drift: 18 },
    // Middle lull.
    { x: 200, y: 140, r: 30, k: 80, drift: 0 },
  ],
  // Off the obvious lines: worth a second each if the detour is short enough.
  shoals: [
    { x: 150, y: 196 },
    { x: 246, y: 128 },
  ],
};

export const COURSES: Course[] = [SANDBAR_SPRINT];
