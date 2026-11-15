// Full race replay: course + input log -> verified result. The server runs exactly this.
import { type BoatState, initialState, raceTicks, step } from './boat';
import type { Course } from './course';
import { MAX_TICKS, UM_PER_M, fdiv } from './fixed';
import { InputPlayer, type InputLog } from './inputs';

export type RaceResult = {
  finished: boolean;
  /** Official time in ticks from the gun, penalties included (0 if not finished). */
  ticks: number;
  penalties: number;
  tacks: number;
  hits: number;
  /** 32 evenly spaced route points (decimetres), for the wake map. */
  route: Array<[number, number]>;
};

export function simulate(course: Course, log: InputLog, onTick?: (s: BoatState) => void): RaceResult {
  const s = initialState(course);
  const player = new InputPlayer(log);
  const trail: Array<[number, number]> = [];
  while (s.phase === 'prestart' || s.phase === 'racing') {
    if (s.tick % 6 === 0) trail.push([fdiv(s.x, UM_PER_M / 10), fdiv(s.y, UM_PER_M / 10)]);
    step(s, course, player.next(s.tick));
    onTick?.(s);
    if (s.tick > MAX_TICKS) break;
  }
  trail.push([fdiv(s.x, UM_PER_M / 10), fdiv(s.y, UM_PER_M / 10)]);
  const route: Array<[number, number]> = [];
  for (let i = 0; i < 32; i++) route.push(trail[Math.floor((i * (trail.length - 1)) / 31)]!);
  const finished = s.phase === 'finished';
  return {
    finished,
    ticks: finished ? raceTicks(s) : 0,
    penalties: s.penalty,
    tacks: s.tacks,
    hits: s.hits,
    route,
  };
}
