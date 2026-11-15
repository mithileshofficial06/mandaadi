// Generated content: every daily and School course is sailable and its stored par is current.
import { describe, expect, it } from 'vitest';
import { initialState, step } from '../../src/shared/core/boat';
import { MAX_TICKS } from '../../src/shared/core/fixed';
import { parTicks } from '../../src/shared/core/par';
import { DEFAULT_PILOT, Pilot } from '../../src/shared/core/pilot';
import { DAILY, PARS, SCHOOL, STAGE_GATE, dailyCourse, levelOpen, stageOpen, starsFor } from '../../src/shared/content/school';

const all = [...DAILY, ...SCHOOL.flatMap((s) => s.levels)];

describe('generated courses', () => {
  it('has a 30-day cycle and 6 x 5 School levels with unique ids and names', () => {
    expect(DAILY).toHaveLength(30);
    expect(SCHOOL.map((s) => s.levels.length)).toEqual([5, 5, 5, 5, 5, 5]);
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
    expect(new Set(DAILY.map((c) => c.name)).size).toBe(30);
  });

  it('stored pars match the physics (re-run tools/gen-courses.ts if not)', () => {
    for (const c of all) expect(PARS[c.id], c.id).toBe(parTicks(c));
  });

  it('every course is sailable from both sides', () => {
    for (const c of all) {
      for (const firstSide of [1, -1] as const) {
        const s = initialState(c);
        const p = new Pilot(c, { ...DEFAULT_PILOT, firstSide });
        while ((s.phase === 'prestart' || s.phase === 'racing') && s.tick <= MAX_TICKS) step(s, c, p.next(s));
        expect(s.phase, `${c.id} side ${firstSide}`).toBe('finished');
      }
    }
  });

  it('cycles every 30 days', () => {
    expect(dailyCourse(1)).toBe(DAILY[0]);
    expect(dailyCourse(30)).toBe(DAILY[29]);
    expect(dailyCourse(31)).toBe(DAILY[0]);
    expect(dailyCourse(0)).toBe(DAILY[29]);
  });

  it('gates levels and stages by stars', () => {
    expect(levelOpen(0, 0, {})).toBe(true);
    expect(levelOpen(0, 1, {})).toBe(false);
    const s1 = SCHOOL[0]!.levels;
    const best: Record<string, number> = { [s1[0]!.id]: 99_999 };
    expect(levelOpen(0, 1, best)).toBe(true);
    expect(stageOpen(1, best)).toBe(false);
    // three stars on every stage-1 level opens stage 2
    for (const c of s1) best[c.id] = PARS[c.id]!;
    expect(starsFor(best[s1[0]!.id]!, PARS[s1[0]!.id]!)).toBe(3);
    expect(STAGE_GATE).toBeLessThanOrEqual(15);
    expect(stageOpen(1, best)).toBe(true);
    expect(stageOpen(2, best)).toBe(false);
  });
});
