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

const LINE = { a: { x: 168, y: 60 }, b: { x: 232, y: 60 } };

/** Monday: light air. Weak wind, patchy pressure: finding wind decides everything. */
export const GLASS_LAGOON: Course = {
  id: 'c002',
  name: 'Glass Lagoon',
  type: 'light',
  wind: { from: deg(15), strength: 0, shiftAmp: 0, shiftPeriod: 0 },
  start: LINE,
  marks: [{ x: 214, y: 172, round: 'port' }],
  finish: LINE,
  islands: [{ parts: [{ x: 300, y: 110, r: 14 }, { x: 312, y: 122, r: 9 }], palms: 3 }],
  puffs: [
    { x: 150, y: 120, r: 36, k: 140, drift: 3 },
    { x: 262, y: 170, r: 30, k: 136, drift: 5 },
    { x: 205, y: 110, r: 34, k: 72, drift: 0 },
    { x: 240, y: 250, r: 40, k: 140, drift: 10 },
  ],
  shoals: [{ x: 176, y: 140 }],
};

/** Wednesday: shifty. The wind swings 12 degrees each way on a 30 s rhythm: tack on the headers. */
export const TEMPLE_POINT: Course = {
  id: 'c003',
  name: 'Temple Point Shifts',
  type: 'shifty',
  wind: { from: deg(0), strength: 1, shiftAmp: deg(12), shiftPeriod: 900 },
  start: LINE,
  marks: [{ x: 196, y: 222, round: 'port' }],
  finish: LINE,
  islands: [{ parts: [{ x: 300, y: 196, r: 16 }, { x: 288, y: 210, r: 10 }], palms: 4 }],
  puffs: [
    { x: 140, y: 190, r: 32, k: 124, drift: 8 },
    { x: 255, y: 120, r: 30, k: 122, drift: 6 },
  ],
  shoals: [{ x: 250, y: 160 }],
};

/** Thursday: tide race. A current runs east through the channel between two islands. */
export const CHANNEL_RUN: Course = {
  id: 'c004',
  name: 'Channel Run',
  type: 'tide',
  wind: { from: deg(350), strength: 1, shiftAmp: 0, shiftPeriod: 0 },
  start: LINE,
  marks: [{ x: 204, y: 224, round: 'port' }],
  finish: LINE,
  islands: [
    { parts: [{ x: 112, y: 150, r: 18 }, { x: 98, y: 164, r: 11 }], palms: 4 },
    { parts: [{ x: 300, y: 170, r: 15 }], palms: 3 },
  ],
  puffs: [{ x: 160, y: 230, r: 34, k: 126, drift: 8 }],
  currents: [
    { x: 200, y: 150, r: 70, dir: deg(90), speed: 6 },
    { x: 230, y: 230, r: 45, dir: deg(250), speed: 4 },
  ],
  shoals: [{ x: 150, y: 110 }],
};

/** Friday: storm. Strong wind, big gusts, fast and unforgiving. */
export const MONSOON_DASH: Course = {
  id: 'c005',
  name: 'Monsoon Dash',
  type: 'storm',
  wind: { from: deg(10), strength: 2, shiftAmp: deg(5), shiftPeriod: 600 },
  start: LINE,
  marks: [{ x: 210, y: 236, round: 'port' }],
  finish: LINE,
  islands: [{ parts: [{ x: 96, y: 204, r: 16 }, { x: 108, y: 216, r: 10 }], palms: 4 }],
  puffs: [
    { x: 260, y: 160, r: 40, k: 140, drift: 15 },
    { x: 170, y: 290, r: 46, k: 140, drift: 22 },
    { x: 200, y: 120, r: 26, k: 84, drift: 0 },
  ],
  shoals: [{ x: 246, y: 200 }],
};

/** Saturday: a triangle (until players set the Saturday course): up, across, back. */
export const TRIANGLE: Course = {
  id: 'c006',
  name: 'Coral Triangle',
  type: 'community',
  wind: { from: deg(0), strength: 1, shiftAmp: 0, shiftPeriod: 0 },
  start: LINE,
  marks: [
    { x: 198, y: 196, round: 'port' },
    { x: 276, y: 140, round: 'port' },
  ],
  finish: LINE,
  islands: [{ parts: [{ x: 110, y: 160, r: 16 }], palms: 3 }],
  puffs: [
    { x: 250, y: 250, r: 36, k: 126, drift: 12 },
    { x: 150, y: 120, r: 30, k: 120, drift: 4 },
  ],
  shoals: [{ x: 250, y: 104 }],
};

/** Sunday: island slalom. Two marks rounded opposite ways, with sand between. */
export const ISLAND_SLALOM: Course = {
  id: 'c007',
  name: 'Island Slalom',
  type: 'cup',
  wind: { from: deg(0), strength: 1, shiftAmp: 0, shiftPeriod: 0 },
  start: LINE,
  marks: [
    { x: 168, y: 150, round: 'starboard' },
    { x: 228, y: 214, round: 'port' },
  ],
  finish: LINE,
  islands: [
    { parts: [{ x: 238, y: 140, r: 13 }], palms: 2 },
    { parts: [{ x: 140, y: 230, r: 14 }, { x: 128, y: 240, r: 8 }], palms: 3 },
  ],
  puffs: [
    { x: 200, y: 260, r: 34, k: 128, drift: 10 },
    { x: 120, y: 110, r: 30, k: 122, drift: 3 },
  ],
  shoals: [{ x: 210, y: 110 }],
};

export const COURSES: Course[] = [SANDBAR_SPRINT, GLASS_LAGOON, TEMPLE_POINT, CHANNEL_RUN, MONSOON_DASH, TRIANGLE, ISLAND_SLALOM];

/** The course for a weekday (0 = Sunday ... 6 = Saturday). */
export const BY_WEEKDAY: Course[] = [ISLAND_SLALOM, GLASS_LAGOON, SANDBAR_SPRINT, TEMPLE_POINT, CHANNEL_RUN, MONSOON_DASH, TRIANGLE];
