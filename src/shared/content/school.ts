// Sailing School rules: stars per level and what is unlocked. Shared by the server and the client.
import type { Course } from '../core/course';
import { COURSES } from './courses';
import { DAILY, PARS, SCHOOL } from './generated';

export { DAILY, PARS, SCHOOL };

/** Stars for a level time: 3 = beat the Harbourmaster, 2 = within 12%, 1 = finished. */
export function starsFor(ticks: number, par: number): 0 | 1 | 2 | 3 {
  if (!ticks) return 0;
  if (par > 0 && ticks <= par) return 3;
  if (par > 0 && ticks * 100 <= par * 112) return 2;
  return 1;
}

/** Stars needed from the previous stage to open the next one (out of 15). */
export const STAGE_GATE = 8;

export type SchoolBest = Record<string, number>;

export function stageStars(stage: number, best: SchoolBest): number {
  return SCHOOL[stage]!.levels.reduce((n, c) => n + starsFor(best[c.id] ?? 0, PARS[c.id] ?? 0), 0);
}

export function stageOpen(stage: number, best: SchoolBest): boolean {
  return stage === 0 || (stageOpen(stage - 1, best) && stageStars(stage - 1, best) >= STAGE_GATE);
}

/** A level is open when its stage is open and the level before it has been finished. */
export function levelOpen(stage: number, level: number, best: SchoolBest): boolean {
  if (!stageOpen(stage, best)) return false;
  return level === 0 || !!best[SCHOOL[stage]!.levels[level - 1]!.id];
}

export function findLevel(id: string): { stage: number; level: number; course: Course } | null {
  for (let s = 0; s < SCHOOL.length; s++) {
    const l = SCHOOL[s]!.levels.findIndex((c) => c.id === id);
    if (l >= 0) return { stage: s, level: l, course: SCHOOL[s]!.levels[l]! };
  }
  return null;
}

/** Day N of Mandaadi races DAILY[(N - 1) mod 30]: a 30-day cycle that repeats. */
export const dailyCourse = (day: number): Course => DAILY[(((day - 1) % DAILY.length) + DAILY.length) % DAILY.length]!;

export const ALL_COURSES: Course[] = [...DAILY, ...SCHOOL.flatMap((s) => s.levels), ...COURSES];
export const courseById = (id: string): Course | undefined => ALL_COURSES.find((c) => c.id === id);
