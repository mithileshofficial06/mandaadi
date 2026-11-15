// Server race flow on the in-memory platform: tokens, verification, attempts, board, ghosts, share.
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app';
import { setPlatform } from '../../src/server/platform';
import { type MemoryPlatform, createMemoryPlatform } from '../../src/server/platform/memory';
import { initialState, step } from '../../src/shared/core/boat';
import { MAX_TICKS } from '../../src/shared/core/fixed';
import { InputRecorder, encodeInputs } from '../../src/shared/core/inputs';
import { Pilot } from '../../src/shared/core/pilot';
import { deg } from '../../src/shared/core/trig';
import { courseFor } from '../../src/server/services/race';
import { today } from '../../src/server/services/time';

let p: MemoryPlatform;
const app = createApp();
const call = async (method: string, path: string, body?: unknown) => {
  const r = await app.fetch(new Request(`http://x${path}`, { method, ...(body ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}) }));
  return { status: r.status, json: (await r.json()) as Record<string, any> };
};
const as = (user: string | null) => p.setCtx({ userId: user ? `t2_${user}` : undefined, username: user ?? undefined, postId: 't3_post' });

/** An autopilot race on today's course, recorded as a player's input log. */
function sail(up = 50): { log: string; ticks: number } {
  const course = courseFor(today());
  const s = initialState(course);
  const pilot = new Pilot(course, { up: deg(up), down: deg(150), overstand: 12, firstSide: 1 });
  const rec = new InputRecorder();
  while ((s.phase === 'prestart' || s.phase === 'racing') && s.tick <= MAX_TICKS) {
    const i = pilot.next(s);
    rec.record(s.tick, i);
    step(s, course, i);
  }
  return { log: encodeInputs(rec.log), ticks: s.tick };
}

beforeEach(() => {
  p = createMemoryPlatform(Date.UTC(2026, 10, 20, 12));
  setPlatform(p);
});

describe('race flow', () => {
  it('verifies a real run, ranks it and offers it as a ghost', async () => {
    as('alice');
    const today0 = (await call('GET', '/api/today')).json;
    expect(today0.attempts).toEqual({ used: 0, max: 4 });
    const st = (await call('POST', '/api/race/start', { date: today0.date, courseId: today0.course.id })).json;
    expect(st.ranked).toBe(true);
    const run = sail();
    p.shiftMs(200_000);
    const fin = await call('POST', '/api/race/finish', { token: st.token, log: run.log, livery: { hull: '#1f5fa8', band: '#c8372d', sailNo: '7' } });
    expect(fin.status).toBe(200);
    expect(fin.json.best.rank).toBe(1);
    expect(fin.json.ticks).toBeGreaterThan(0);
    // the same ticket cannot be used twice
    expect((await call('POST', '/api/race/finish', { token: st.token, log: run.log })).status).toBe(409);
    as('bob');
    const g = (await call('GET', '/api/ghosts')).json;
    expect(g.ghosts[0].name).toBe('u/alice');
    expect((await call('GET', '/api/routes')).json.routes.length).toBe(1);
    const b = (await call('GET', '/api/board')).json;
    expect(b.sailors).toBe(1);
  });

  it('rejects runs that finish faster than the clock, or never finish', async () => {
    as('carol');
    const t = (await call('GET', '/api/today')).json;
    const st = (await call('POST', '/api/race/start', { date: t.date, courseId: t.course.id })).json;
    const fast = await call('POST', '/api/race/finish', { token: st.token, log: sail().log });
    expect(fast.json.error.code).toBe('too-fast');
    const st2 = (await call('POST', '/api/race/start', { date: t.date, courseId: t.course.id })).json;
    p.shiftMs(200_000);
    const dnf = await call('POST', '/api/race/finish', { token: st2.token, log: encodeInputs([{ t: 0, steer: 0, tack: false }]) });
    expect(dnf.json.error.code).toBe('not-finished');
  });

  it('limits attempts, ranks nobody logged out, and shares once', async () => {
    as(null);
    const t = (await call('GET', '/api/today')).json;
    expect((await call('POST', '/api/race/start', { date: t.date, courseId: t.course.id })).json).toEqual({ ranked: false, reason: 'login' });
    as('dave');
    for (let i = 0; i < 4; i++) expect((await call('POST', '/api/race/start', { date: t.date, courseId: t.course.id })).json.ranked).toBe(true);
    expect((await call('POST', '/api/race/start', { date: t.date, courseId: t.course.id })).json.reason).toBe('attempts');
    as('erin');
    const st = (await call('POST', '/api/race/start', { date: t.date, courseId: t.course.id })).json;
    p.shiftMs(200_000);
    await call('POST', '/api/race/finish', { token: st.token, log: sail().log });
    expect((await call('POST', '/api/share', {})).status).toBe(200);
    expect(p.comments[0]!.text).toContain('Day');
    expect((await call('POST', '/api/share', {})).status).toBe(429);
  });

  it('posts one race per day from the scheduler', async () => {
    await call('POST', '/internal/cron/daily-rollover');
    await call('POST', '/internal/cron/daily-rollover');
    expect(p.posts.length).toBe(1);
    p.shiftDays(1);
    await call('POST', '/internal/cron/daily-rollover');
    expect(p.posts.length).toBe(2);
  });
});
