// Local harness entry (loaded by vite.harness.config.ts via ssrLoadModule). Runs the real
// app routes against the in-memory platform. ?user=<name> sets the logged-in user
// (omit or ?user=anon for logged-out). /__harness/* controls the fake world.
import { createApp } from './app';
import { initialState, step } from '../shared/core/boat';
import { MAX_TICKS } from '../shared/core/fixed';
import { InputRecorder, encodeInputs } from '../shared/core/inputs';
import { Pilot } from '../shared/core/pilot';
import { simulate } from '../shared/core/simulate';
import { deg } from '../shared/core/trig';
import { courseFor, storeRun } from './services/race';
import { today } from './services/time';
import { setPlatform } from './platform';
import { createMemoryPlatform, type MemoryPlatform } from './platform/memory';

type HarnessGlobal = { __mandaadiHarness?: { p: MemoryPlatform; app: ReturnType<typeof createApp> } };
const g = globalThis as HarnessGlobal;
// Keep the fake world (Redis, posts) across hot reloads, but always rebuild the app so
// route changes take effect.
const state = { p: g.__mandaadiHarness?.p ?? createMemoryPlatform(), app: createApp() };
g.__mandaadiHarness = state;
setPlatform(state.p);

export async function handle(req: Request): Promise<Response> {
  setPlatform(state.p);
  const url = new URL(req.url);
  const referer = req.headers.get('referer');
  const refUser = referer ? new URL(referer).searchParams.get('user') : null;
  const user = url.searchParams.get('user') ?? refUser ?? 'alice';
  const anon = user === 'anon';
  state.p.setCtx({
    userId: anon ? undefined : `t2_${user}`,
    username: anon ? undefined : user,
    postId: req.headers.get('x-harness-post') ?? 't3_harness',
  });

  if (url.pathname === '/__harness/advance-day') {
    state.p.shiftDays(Number(url.searchParams.get('n') ?? '1'));
    const r = await state.app.fetch(new Request('http://localhost/internal/cron/daily-rollover', { method: 'POST' }));
    return new Response(await r.text(), { headers: { 'content-type': 'application/json' } });
  }
  if (url.pathname === '/__harness/state') {
    return Response.json({
      keys: state.p.kv.size(),
      posts: state.p.posts,
      comments: state.p.comments.map((c) => ({ ...c, imageUrl: c.imageUrl ? '(image)' : undefined })),
      flairs: Object.fromEntries(state.p.flairs),
      now: new Date(state.p.now()).toISOString(),
    });
  }
  if (url.pathname === '/__harness/seed') {
    // Harness only: fill today's board with varied autopilot sailors to see a busy wake map.
    const n = Math.min(60, Number(url.searchParams.get('n') ?? '25'));
    const date = today();
    const course = courseFor(date);
    for (let i = 0; i < n; i++) {
      const s = initialState(course);
      const pilot = new Pilot(course, { up: deg(45 + (i % 9)), down: deg(140 + ((i * 7) % 25)), overstand: deg((i * 3) % 10), firstSide: i % 3 ? 1 : -1 });
      const rec = new InputRecorder();
      while ((s.phase === 'prestart' || s.phase === 'racing') && s.tick <= MAX_TICKS) {
        const inp = pilot.next(s);
        rec.record(s.tick, inp);
        step(s, course, inp);
      }
      const log = encodeInputs(rec.log);
      const res = simulate(course, rec.log);
      if (res.finished) await storeRun(date, `t2_seed${i}`, { name: `sailor_${i}`, ticks: res.ticks, log, livery: null }, res.route);
    }
    return Response.json({ ok: true, n });
  }
  if (url.pathname === '/__harness/reset') {
    state.p = createMemoryPlatform();
    g.__mandaadiHarness = state;
    setPlatform(state.p);
    return Response.json({ ok: true });
  }
  return state.app.fetch(req);
}
