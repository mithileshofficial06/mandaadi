import { Hono } from 'hono';
import type { AbandonResponse, SchoolLevelResponse, SchoolFinishResponse, SchoolResponse, BoardResponse, FinishResponse, GhostsResponse, LiveryDto, RoutesResponse, ShareResponse, StartResponse, TodayResponse } from '../../shared/api/types';
import { platform } from '../platform';
import { ApiErr } from '../services/errors';
import { abandonRace, schoolLevel, schoolBest, schoolFinish, attempts, board, courseFor, dateOfPost, finishRace, ghosts, myBest, par, profile, routes, saveLivery, share, startRace } from '../services/race';
import { dayNumber, today } from '../services/time';

export const api = new Hono();

api.get('/today', async (c) => {
  const ctx = platform().ctx();
  const date = await dateOfPost();
  const course = courseFor(date);
  const p = await par(course);
  const [att, best, b, prof] = await Promise.all([attempts(date, ctx.userId), myBest(date, ctx.userId, p), board(date, ctx.userId), profile(ctx.userId)]);
  const res: TodayResponse = {
    date,
    day: dayNumber(date),
    course,
    user: { username: ctx.username ?? null, loggedIn: !!ctx.userId },
    live: date === today(),
    par: p,
    attempts: att,
    best,
    sailors: b.sailors,
    top: b.rows[0] ?? null,
    profile: prof,
    // Test tools only for moderators of a private-style *_dev playtest subreddit.
    dev: /_dev$/i.test(ctx.subredditName) && !!ctx.username && (await platform().reddit.isModerator(ctx.username).catch(() => false)),
  };
  return c.json(res);
});

const body = async <T>(c: { req: { json<J>(): Promise<J> } }): Promise<T> => {
  try {
    return await c.req.json<T>();
  } catch {
    throw new ApiErr('bad-request', 'That request could not be read.');
  }
};

api.post('/race/start', async (c) => {
  const b = await body<{ date?: string; courseId?: string }>(c);
  const res: StartResponse = await startRace(String(b.date ?? ''), String(b.courseId ?? ''));
  return c.json(res);
});

api.post('/race/finish', async (c) => {
  const b = await body<{ token?: string; log?: string; livery?: LiveryDto | null }>(c);
  const res: FinishResponse = await finishRace(String(b.token ?? ''), String(b.log ?? ''), b.livery ?? null);
  return c.json(res);
});

api.get('/board', async (c) => {
  const res: BoardResponse = await board(await dateOfPost(), platform().ctx().userId);
  return c.json(res);
});

api.get('/ghosts', async (c) => {
  const res: GhostsResponse = { ghosts: await ghosts(await dateOfPost(), platform().ctx().userId) };
  return c.json(res);
});

api.get('/routes', async (c) => {
  const res: RoutesResponse = await routes(await dateOfPost(), platform().ctx().userId);
  return c.json(res);
});

api.post('/livery', async (c) => {
  const b = await body<{ livery?: LiveryDto | null }>(c);
  await saveLivery(b.livery ?? null);
  return c.json({ ok: true });
});

api.post('/share', async (c) => {
  const b = await body<{ image?: string | null }>(c);
  const res: ShareResponse = await share(await dateOfPost(), typeof b.image === 'string' ? b.image : null);
  return c.json(res);
});

api.get('/school', async (c) => {
  const res: SchoolResponse = { best: await schoolBest(platform().ctx().userId) };
  return c.json(res);
});

api.post('/school/finish', async (c) => {
  const b = await body<{ levelId?: string; log?: string; livery?: LiveryDto | null }>(c);
  const res: SchoolFinishResponse = await schoolFinish(String(b.levelId ?? ''), String(b.log ?? ''), b.livery ?? null);
  return c.json(res);
});

api.get('/school/level', async (c) => {
  const res: SchoolLevelResponse = await schoolLevel(c.req.query('id') ?? '');
  return c.json(res);
});

api.post('/race/abandon', async (c) => {
  const b = await body<{ token?: string }>(c);
  const res: AbandonResponse = await abandonRace(String(b.token ?? ''));
  return c.json(res);
});
