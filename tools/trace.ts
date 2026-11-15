import { initialState, step } from '../src/shared/core/boat';
import { Pilot, DEFAULT_PILOT } from '../src/shared/core/pilot';
import { COURSES } from '../src/shared/content/courses';
const c = COURSES[Number(process.argv[3] ?? 0)]!;
const side = Number(process.argv[2] ?? 1) as 1 | -1;
const s = initialState(c);
const p = new Pilot(c, { ...DEFAULT_PILOT, firstSide: side });
while ((s.phase === 'prestart' || s.phase === 'racing') && s.tick < 3000) {
  const i = p.next(s);
  step(s, c, i);
  if (s.tick % 45 === 0 || s.ev) console.log(s.tick, s.phase, 'leg', s.leg, 'pos', (s.x / 1e6).toFixed(1), (s.y / 1e6).toFixed(1), 'h', Math.round(s.h * 360 / 4096), 'v', (s.v * 30 / 1e6).toFixed(2), 'ev', s.ev, 'in', i.steer, i.tack, 'sweep', s.sweep, 'tackTo', s.tackTo);
}
console.log('END', s.phase, s.finishTick);
