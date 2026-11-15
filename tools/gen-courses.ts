// Generates the 30-day daily cycle and the Sailing School levels into src/shared/content/generated.ts.
// Deterministic (seeded). Every course must be sailable: the autopilot from both sides and the
// Harbourmaster all finish, and the par lands in the target window, else the seed is rejected.
// Re-run after any physics change:  npx tsx tools/gen-courses.ts
import { writeFileSync } from 'node:fs';
import { initialState, step } from '../src/shared/core/boat';
import type { Course, Current, Island, Mark, Puff, RaceType, Shoal } from '../src/shared/core/course';
import { MAX_TICKS, TICK_HZ } from '../src/shared/core/fixed';
import { parTicks } from '../src/shared/core/par';
import { DEFAULT_PILOT, Pilot } from '../src/shared/core/pilot';
import { mulberry32 } from '../src/shared/core/rng';
import { deg } from '../src/shared/core/trig';

const LINE = { a: { x: 168, y: 60 }, b: { x: 232, y: 60 } };

// Real islands and places of the Gulf of Mannar, and kinds of course.
const PLACES = ['Kurusadai', 'Pullivasal', 'Poomarichan', 'Manoli', 'Hare Island', 'Mulli', 'Valai', 'Thalaiyari', 'Appa', 'Poovarasan', 'Valimunai', 'Anaipar', 'Nallathanni', 'Puluvinichalli', 'Upputhanni', 'Kariyachalli', 'Vaan', 'Koswari', 'Vilanguchalli', 'Pamban', 'Dhanushkodi', 'Mandapam', 'Kilakarai', 'Erwadi', 'Thondi', 'Sethu', 'Devipattinam', 'Valinokkam', 'Rameswaram', 'Keelakarai'];
const KIND: Record<RaceType, string[]> = {
  light: ['Drift', 'Glass', 'Whisper', 'Calm'],
  windward: ['Reach', 'Beat', 'Sprint', 'Run'],
  shifty: ['Shifts', 'Swing', 'Veer', 'Backing Run'],
  tide: ['Channel', 'Passage', 'Tide Race', 'Narrows'],
  storm: ['Squall', 'Monsoon', 'Gale Run', 'Storm Dash'],
  community: ['Triangle', 'Circuit', 'Loop', 'Round'],
  cup: ['Slalom', 'Cup', 'Gauntlet', 'Crossing'],
};

type Spec = {
  type: RaceType;
  /** 0 easy .. 1 hardest */
  d: number;
  marks: 1 | 2 | 3;
  islands: [number, number];
  puffs: [number, number];
  shoals: [number, number];
  currents: [number, number];
  strength?: 0 | 1 | 2;
  shift?: boolean;
  /** par window in seconds */
  par: [number, number];
  /** Upwind distance band for the first mark. */
  reach?: [number, number];
  /** Require the two sides to differ by at least this many seconds (a real decision). */
  decide?: number;
};

type Rng = { int(lo: number, hi: number): number; pick<T>(a: readonly T[]): T; chance(p: number): boolean };
function rng(seed: number): Rng {
  const next = mulberry32(seed);
  const int = (lo: number, hi: number) => lo + (next() % (hi - lo + 1));
  return { int, pick: (a) => a[int(0, a.length - 1)]!, chance: (p) => next() % 1000 < p * 1000 };
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

function marksFor(r: Rng, s: Spec): Mark[] {
  const [lo, hi] = s.reach ?? [170, 245];
  const m1: Mark = { x: 200 + r.int(-35, 35), y: r.int(lo, hi), round: 'port' };
  if (lo < 125) return [{ ...m1, x: 200 + r.int(-20, 20) }];
  if (s.marks === 1) return [m1];
  const side = r.chance(0.5) ? 1 : -1;
  const m2: Mark = { x: m1.x + side * r.int(60, 95), y: m1.y + r.int(-70, 10), round: r.chance(0.5) ? 'port' : 'starboard' };
  if (s.marks === 2) {
    if (r.chance(0.5)) {
      // slalom: a low mark first, then the top mark, rounded opposite ways
      const low: Mark = { x: 200 - side * r.int(25, 45), y: r.int(130, 160), round: 'starboard' };
      return [low, { ...m1, round: 'port' }];
    }
    return [m1, m2];
  }
  const m3: Mark = { x: 200 - side * r.int(55, 90), y: r.int(130, 175), round: r.chance(0.5) ? 'port' : 'starboard' };
  return [m1, m2, m3];
}

function build(id: string, name: string, s: Spec, seed: number): Course {
  const r = rng(seed);
  const marks = marksFor(r, s).map((m) => ({ ...m, x: Math.max(80, Math.min(320, m.x)), y: Math.max(s.reach && s.reach[0] < 125 ? s.reach[0] : 125, Math.min(300, m.y)) }));
  const avoid: Array<{ x: number; y: number; r: number }> = [...marks.map((m) => ({ x: m.x, y: m.y, r: 26 })), { x: 200, y: 60, r: 50 }];
  const islands: Island[] = [];
  const nIsl = r.int(s.islands[0], s.islands[1]);
  for (let tries = 0; islands.length < nIsl && tries < 200; tries++) {
    const c = { x: r.int(70, 330), y: r.int(110, 320), r: r.int(9, 19) };
    if (avoid.some((a) => dist(a, c) < a.r + c.r + 14)) continue;
    const parts = [c];
    const extra = r.int(0, 2);
    for (let k = 0; k < extra; k++) parts.push({ x: c.x + r.int(-14, 14), y: c.y + r.int(-14, 14), r: r.int(5, 10) });
    islands.push({ parts, palms: r.int(1, 5) });
    avoid.push({ x: c.x, y: c.y, r: c.r + 8 });
  }
  const puffs: Puff[] = [];
  const nPuff = r.int(s.puffs[0], s.puffs[1]);
  for (let k = 0; k < nPuff; k++) {
    const lull = k > 0 && r.chance(0.25);
    puffs.push({ x: r.int(90, 310), y: r.int(90, 320), r: r.int(26, 50), k: lull ? r.int(78, 88) : r.int(118, 118 + Math.round(24 * (0.5 + s.d / 2))), drift: r.int(0, 22) });
  }
  const shoals: Shoal[] = [];
  const nShoal = r.int(s.shoals[0], s.shoals[1]);
  const legs = [{ x: 200, y: 60 }, ...marks, { x: 200, y: 60 }];
  for (let tries = 0; shoals.length < nShoal && tries < 60; tries++) {
    const i = r.int(0, legs.length - 2);
    const a = legs[i]!;
    const b = legs[i + 1]!;
    const t = r.int(30, 70) / 100;
    const off = r.int(14, 34) * (r.chance(0.5) ? 1 : -1);
    const L = dist(a, b) || 1;
    const p = { x: Math.round(a.x + (b.x - a.x) * t + (-(b.y - a.y) / L) * off), y: Math.round(a.y + (b.y - a.y) * t + ((b.x - a.x) / L) * off) };
    if (p.y < 85 || islands.some((isl) => isl.parts.some((q) => dist(q, p) < q.r + 10)) || marks.some((m) => dist(m, p) < 16)) continue;
    shoals.push(p);
  }
  const currents: Current[] = [];
  const nCur = r.int(s.currents[0], s.currents[1]);
  for (let k = 0; k < nCur; k++) currents.push({ x: r.int(120, 280), y: r.int(110, 260), r: r.int(40, 70), dir: deg(r.int(0, 359)), speed: r.int(3, 4 + Math.round(4 * s.d)) });
  const strength = s.strength ?? (s.type === 'light' ? 0 : s.type === 'storm' ? 2 : 1);
  const from = deg(r.int(-12, 12));
  const shift = s.shift ?? s.type === 'shifty';
  return {
    id,
    name,
    type: s.type,
    wind: { from: from < 0 ? from + 4096 : from, strength, shiftAmp: shift ? deg(r.int(6, 6 + Math.round(8 * s.d))) : 0, shiftPeriod: shift ? r.int(420, 900) : 0 },
    start: LINE,
    marks,
    finish: LINE,
    islands,
    puffs,
    ...(shoals.length ? { shoals } : {}),
    ...(currents.length ? { currents } : {}),
  };
}

/** Finish ticks for the autopilot going left first and right first (0 = failed). */
function sides(c: Course): [number, number] {
  const out: number[] = [];
  for (const firstSide of [1, -1] as const) {
    const s = initialState(c);
    const p = new Pilot(c, { ...DEFAULT_PILOT, firstSide });
    while ((s.phase === 'prestart' || s.phase === 'racing') && s.tick <= MAX_TICKS) step(s, c, p.next(s));
    out.push(s.phase === 'finished' && s.hits <= 2 ? s.tick : 0);
  }
  return [out[0]!, out[1]!];
}

/** Courses already chosen, to keep neighbours and lookalikes apart. */
type Picked = { course: Course; par: number };
function samey(c: Course, par: number, others: Picked[]): boolean {
  return others.some((o) => o.course.type === c.type && o.course.marks.length === c.marks.length && Math.abs(o.par - par) < 4 * TICK_HZ);
}

function make(id: string, name: string, s: Spec, seed0: number, others: Picked[] = []): Picked {
  const why = { par: 0, samey: 0, fail: 0, decide: 0, pars: [] as number[] };
  for (let k = 0; k < 3000; k++) {
    const c = build(id, name, s, seed0 * 7919 + k * 104729 + 17);
    const par = parTicks(c);
    if (k < 12) why.pars.push(Math.round(par / TICK_HZ));
    if (!par || par < s.par[0] * TICK_HZ || par > s.par[1] * TICK_HZ) { why.par++; continue; }
    if (samey(c, par, others)) { why.samey++; continue; }
    const [a, b] = sides(c);
    if (!a || !b) { why.fail++; continue; }
    if (s.decide && Math.abs(a - b) < s.decide * TICK_HZ) { why.decide++; continue; }
    return { course: c, par };
  }
  throw new Error(`no sailable course for ${id}: ${JSON.stringify(why)}`);
}

const used = new Set<string>();
function nameFor(r: Rng, type: RaceType): string {
  for (;;) {
    const n = `${r.pick(PLACES)} ${r.pick(KIND[type])}`;
    if (!used.has(n)) {
      used.add(n);
      return n;
    }
  }
}

// ---------- the 30-day daily cycle ----------
const DAILY_TYPES: RaceType[] = ['windward', 'shifty', 'tide', 'cup', 'storm', 'community', 'light'];
const daily: Array<{ course: Course; par: number }> = [];
const DAY_PLACE = (() => {
  const r = rng(77);
  const order = PLACES.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = r.int(0, i);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
})();
for (let i = 0; i < 30; i++) {
  const r = rng(1000 + i);
  const type = DAILY_TYPES[i % DAILY_TYPES.length]!;
  // Difficulty swings through the month instead of climbing: no two neighbours feel alike.
  const d = 0.45 + (0.55 * ((i * 11) % 30)) / 29;
  const marks: 1 | 2 | 3 = type === 'community' ? 3 : type === 'cup' ? 2 : d > 0.75 ? 2 : r.chance(0.35) ? 2 : 1;
  const spec: Spec = {
    type,
    d,
    marks,
    islands: [1, 1 + Math.round(3 * d)],
    puffs: [2, 3 + Math.round(2 * d)],
    shoals: [1, 2 + Math.round(d)],
    currents: type === 'tide' ? [1, 2] : d > 0.8 ? [0, 1] : [0, 0],
    par: marks === 3 ? [60, 98] : [55, 92],
    decide: 1.5,
  };
  // Each day of the cycle gets its own place: 30 places, 30 days.
  const name = `${PLACES[DAY_PLACE[i]!]} ${r.pick(KIND[type])}`;
  used.add(name);
  daily.push(make(`d${String(i + 1).padStart(2, '0')}`, name, spec, 31 + i, daily));
}

// ---------- the Sailing School ----------
type StageDef = { id: string; name: string; lesson: string; specs: (l: number) => Spec };
const STAGES: StageDef[] = [
  { id: 's1', name: 'Harbour Mouth', lesson: 'Steer with one thumb. Sail across the wind, never straight into the red cone.', specs: (l) => ({ type: 'windward', d: l * 0.04, marks: 1, islands: [0, 0], puffs: [0, l > 2 ? 1 : 0], shoals: [0, l > 3 ? 1 : 0], currents: [0, 0], strength: 1, par: [31 + l * 7, 39 + l * 7], reach: [118 + l * 18, 132 + l * 20] }) },
  { id: 's2', name: 'Beating Upwind', lesson: 'Zigzag up to the mark. Tack when the mark is behind your shoulder.', specs: (l) => ({ type: 'windward', d: 0.15 + l * 0.05, marks: l > 3 ? 2 : 1, islands: [0, l > 2 ? 1 : 0], puffs: [1, 2], shoals: [0, 1], currents: [0, 0], par: [46 + l * 6, 54 + l * 6], decide: 1, reach: [160 + l * 16, 180 + l * 16] }) },
  { id: 's3', name: 'Pressure', lesson: 'Dark water is more wind. Sail to the gusts, avoid the pale lulls.', specs: (l) => ({ type: l % 2 ? 'light' : 'windward', d: 0.3 + l * 0.05, marks: l > 2 ? 2 : 1, islands: [0, 1], puffs: [3, 4], shoals: [1, 2], currents: [0, 0], par: [50 + l * 7, 58 + l * 7], decide: 1, reach: (l % 2 ? [122 + l * 10, 142 + l * 10] : [150 + l * 12, 172 + l * 12]) as [number, number] }) },
  { id: 's4', name: 'Reef Country', lesson: 'Islands block the way and steal the wind. Plan your side before the start.', specs: (l) => ({ type: 'cup', d: 0.45 + l * 0.05, marks: l > 1 ? 2 : 1, islands: [2, 3 + Math.min(1, l)], puffs: [2, 3], shoals: [1, 2], currents: [0, 0], par: [54 + l * 7, 62 + l * 7], decide: 1, reach: [148 + l * 15, 172 + l * 15] }) },
  { id: 's5', name: 'Tide Race', lesson: 'The arrows on the water push you. Use the current, or sail out of it.', specs: (l) => ({ type: 'tide', d: 0.6 + l * 0.05, marks: l > 2 ? 2 : 1, islands: [1, 2], puffs: [2, 3], shoals: [1, 2], currents: [1, 2], par: [56 + l * 7, 64 + l * 7], decide: 1, reach: [150 + l * 15, 175 + l * 15] }) },
  { id: 's6', name: 'Monsoon', lesson: 'Strong wind, big shifts, three marks. Everything you learnt, at speed.', specs: (l) => ({ type: l % 2 ? 'storm' : 'shifty', d: 0.75 + l * 0.05, marks: l > 1 ? 3 : 2, islands: [2, 3], puffs: [3, 4], shoals: [1, 3], currents: [0, l > 2 ? 1 : 0], shift: true, strength: 2, par: [60 + l * 8, 68 + l * 8], decide: 1, reach: [158 + l * 16, 188 + l * 16] }) },
];
const LEVELS = 5;
const schoolPicked: Picked[] = [];
const school = STAGES.map((st, si) => ({
  id: st.id,
  name: st.name,
  lesson: st.lesson,
  levels: Array.from({ length: LEVELS }, (_, l) => {
    const spec = st.specs(l);
    const r = rng(5000 + si * 100 + l);
    const lv = make(`${st.id}-${l + 1}`, nameFor(r, spec.type), spec, 700 + si * 50 + l);
    schoolPicked.push(lv);
    return lv;
  }),
}));

// ---------- write ----------
const pars: Record<string, number> = {};
for (const x of daily) pars[x.course.id] = x.par;
for (const st of school) for (const x of st.levels) pars[x.course.id] = x.par;
const out = `// GENERATED by tools/gen-courses.ts. Do not edit by hand; re-run the tool after physics changes.
import type { Course } from '../core/course';

/** The daily race cycle: day N races DAILY[(N - 1) % 30]. */
export const DAILY: Course[] = ${JSON.stringify(daily.map((x) => x.course))};

export type SchoolStage = { id: string; name: string; lesson: string; levels: Course[] };
/** Sailing School: stages of levels, easy to hard. */
export const SCHOOL: SchoolStage[] = ${JSON.stringify(school.map((s) => ({ id: s.id, name: s.name, lesson: s.lesson, levels: s.levels.map((x) => x.course) })))};

/** Harbourmaster par (ticks) per course id, precomputed. A unit test checks it is current. */
export const PARS: Record<string, number> = ${JSON.stringify(pars)};
`;
writeFileSync('src/shared/content/generated.ts', out);
console.log('daily', daily.map((x) => `${x.course.id} ${x.course.name} ${(x.par / 30).toFixed(0)}s`).join(' | '));
console.log('school', school.map((s) => `${s.name}: ${s.levels.map((x) => (x.par / 30).toFixed(0)).join('/')}`).join(' | '));
