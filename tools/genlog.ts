// Print an encoded autopilot input log for a course id (for testing the server check on Reddit).
// Usage: npx tsx tools/genlog.ts <courseId> [upDeg]
import { initialState, step } from '../src/shared/core/boat';
import { COURSES } from '../src/shared/content/courses';
import { MAX_TICKS } from '../src/shared/core/fixed';
import { InputRecorder, encodeInputs } from '../src/shared/core/inputs';
import { Pilot } from '../src/shared/core/pilot';
import { simulate } from '../src/shared/core/simulate';
import { deg } from '../src/shared/core/trig';
const c = COURSES.find((x) => x.id === process.argv[2])!;
const s = initialState(c);
const p = new Pilot(c, { up: deg(Number(process.argv[3] ?? 48)), down: deg(150), overstand: 12, firstSide: 1 });
const rec = new InputRecorder();
while ((s.phase === 'prestart' || s.phase === 'racing') && s.tick <= MAX_TICKS) {
  const i = p.next(s);
  rec.record(s.tick, i);
  step(s, c, i);
}
const r = simulate(c, rec.log);
console.error('ticks', r.ticks, 'finished', r.finished);
console.log(encodeInputs(rec.log));
