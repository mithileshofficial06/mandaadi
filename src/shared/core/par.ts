// The Harbourmaster: the reference boat everyone races against, and the par for medals.
// Deterministic, so the server and every client agree on its time.
import { initialState, raceTicks, step } from './boat';
import type { Course } from './course';
import { MAX_TICKS } from './fixed';
import { Pilot, type PilotOpts } from './pilot';
import { deg } from './trig';

export const HARBOURMASTER: PilotOpts = { up: deg(50), down: deg(150), overstand: 12, firstSide: -1 };

/** The Harbourmaster's race time in ticks (0 if it cannot finish). */
export function parTicks(course: Course): number {
  const s = initialState(course);
  const p = new Pilot(course, HARBOURMASTER);
  while ((s.phase === 'prestart' || s.phase === 'racing') && s.tick <= MAX_TICKS) step(s, course, p.next(s));
  return s.phase === 'finished' ? raceTicks(s) : 0;
}

export type Medal = 'harbourmaster' | 'navigator' | 'deckhand';
export const MEDAL_NAME: Record<Medal, string> = { harbourmaster: 'Harbourmaster', navigator: 'Navigator', deckhand: 'Deckhand' };

/** Beat the Harbourmaster: gold. Within 15%: silver. Any finish: bronze. */
export function medalFor(ticks: number, par: number): Medal {
  if (par > 0 && ticks <= par) return 'harbourmaster';
  if (par > 0 && ticks * 100 <= par * 115) return 'navigator';
  return 'deckhand';
}
