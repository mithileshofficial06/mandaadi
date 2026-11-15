// Daily race: attempts, server-verified times, leaderboard, ghosts, routes and sharing.
// A time only counts if the server re-sails the player's input log and gets that exact time.
import { BY_WEEKDAY } from '../../shared/content/courses';
import type { Course } from '../../shared/core/course';
import { TICK_HZ } from '../../shared/core/fixed';
import { decodeInputs } from '../../shared/core/inputs';
import { type Medal, MEDAL_NAME, medalFor, parTicks } from '../../shared/core/par';
import { simulate } from '../../shared/core/simulate';
import type { BoardRow, Ghost, LiveryDto } from '../../shared/api/types';
import { platform } from '../platform';
import { ApiErr } from './errors';
import { dayNumber, today, weekday } from './time';

export const MAX_ATTEMPTS = 3;
const KEEP_S = 4 * 86_400;
const TOKEN_S = 30 * 60;
const MAX_LOG = 40_000;

export type Run = { name: string; ticks: number; log: string; livery: LiveryDto | null };
type Token = { uid: string; name: string; date: string; t: number };

const k = {
  post: (postId: string) => `post:${postId}`,
  posted: (date: string) => `posted:${date}`,
  par: (courseId: string) => `par:${courseId}`,
  att: (date: string, uid: string) => `att:${date}:${uid}`,
  finished: (uid: string) => `fin:${uid}`,
  tok: (t: string) => `tok:${t}`,
  lb: (date: string) => `lb:${date}`,
  runs: (date: string) => `run:${date}`,
  routes: (date: string) => `rt:${date}`,
  shared: (date: string, uid: string) => `shared:${date}:${uid}`,
};
const kv = () => platform().kv;
const expiry = (s: number) => new Date(platform().now() + s * 1000);

export const courseFor = (date: string): Course => BY_WEEKDAY[weekday(date)]!;

/** The date this post races: its own day for daily posts, today otherwise. */
export async function dateOfPost(): Promise<string> {
  const id = platform().ctx().postId;
  return (id && (await kv().get(k.post(id)))) || today();
}

export async function rememberPost(postId: string, date: string): Promise<void> {
  await kv().set(k.post(postId), date);
}

/** Claim the right to post a date's race (true once per date). */
export async function claimDailyPost(date: string): Promise<boolean> {
  return !!(await kv().set(k.posted(date), '1', { nx: true, expiration: expiry(KEEP_S) }));
}

export async function par(course: Course): Promise<number> {
  const c = await kv().get(k.par(course.id));
  if (c) return Number(c);
  const p = parTicks(course);
  await kv().set(k.par(course.id), String(p), { expiration: expiry(KEEP_S) });
  return p;
}

export async function attempts(date: string, uid: string | undefined): Promise<{ used: number; max: number }> {
  if (!uid) return { used: 0, max: MAX_ATTEMPTS };
  const [used, fin] = await Promise.all([kv().get(k.att(date, uid)), kv().get(k.finished(uid))]);
  // First-run mode: one extra warm-up attempt until the end of the day of your first finish.
  return { used: Number(used ?? 0), max: MAX_ATTEMPTS + (!fin || fin === date ? 1 : 0) };
}

export async function startRace(date: string, courseId: string) {
  const ctx = platform().ctx();
  if (!ctx.userId || !ctx.username) return { ranked: false as const, reason: 'login' as const };
  if (date !== today()) return { ranked: false as const, reason: 'old-day' as const };
  if (courseId !== courseFor(date).id) return { ranked: false as const, reason: 'course' as const };
  const a = await attempts(date, ctx.userId);
  if (a.used >= a.max) return { ranked: false as const, reason: 'attempts' as const };
  const used = await kv().incrBy(k.att(date, ctx.userId), 1);
  await kv().expire(k.att(date, ctx.userId), KEEP_S);
  if (used > a.max) return { ranked: false as const, reason: 'attempts' as const };
  const token = crypto.randomUUID();
  const t: Token = { uid: ctx.userId, name: ctx.username, date, t: platform().now() };
  await kv().set(k.tok(token), JSON.stringify(t), { expiration: expiry(TOKEN_S) });
  return { ranked: true as const, token, attempts: { used, max: a.max } };
}

const rowOf = (rank: number, name: string, ticks: number, p: number, me: boolean): BoardRow => ({ rank, name, ticks, medal: medalFor(ticks, p), ...(me ? { me: true } : {}) });

export async function myBest(date: string, uid: string | undefined, p: number): Promise<BoardRow | null> {
  if (!uid) return null;
  const [score, rank] = await Promise.all([kv().zScore(k.lb(date), uid), kv().zRank(k.lb(date), uid)]);
  if (score === undefined || rank === undefined) return null;
  const run = await kv().hGet(k.runs(date), uid);
  const name = run ? (JSON.parse(run) as Run).name : 'you';
  return rowOf(rank + 1, name, score, p, true);
}

export async function finishRace(tokenId: string, logStr: string, livery: LiveryDto | null) {
  if (typeof tokenId !== 'string' || typeof logStr !== 'string' || logStr.length > MAX_LOG) throw new ApiErr('bad-request', 'That race could not be read.');
  const raw = await kv().get(k.tok(tokenId));
  if (!raw) throw new ApiErr('token', 'This race ticket has expired. Start a new race.', 409);
  await kv().del(k.tok(tokenId));
  const tok = JSON.parse(raw) as Token;
  const ctx = platform().ctx();
  if (ctx.userId !== tok.uid) throw new ApiErr('token', 'This race belongs to someone else.', 403);
  const log = decodeInputs(logStr);
  if (!log) throw new ApiErr('bad-request', 'That race could not be read.');
  const course = courseFor(tok.date);
  const res = simulate(course, log);
  if (!res.finished) throw new ApiErr('not-finished', 'The harbour did not see you cross the finish line.', 400);
  // The race cannot have been sailed faster than real time (pauses only make it slower).
  const elapsed = platform().now() - tok.t;
  if (elapsed < ((res.ticks * 1000) / TICK_HZ) * 0.8) throw new ApiErr('too-fast', 'That race finished faster than the clock allows.', 400);

  const p = await par(course);
  const prev = await kv().zScore(k.lb(tok.date), tok.uid);
  const improved = prev === undefined || res.ticks < prev;
  if (improved) await storeRun(tok.date, tok.uid, { name: tok.name, ticks: res.ticks, log: logStr, livery: cleanLivery(livery) }, res.route);
  // Remember the day of the first ever finish: the warm-up bonus lasts that whole day.
  await kv().set(k.finished(tok.uid), tok.date, { nx: true });
  const [best, sailors, att] = await Promise.all([myBest(tok.date, tok.uid, p), kv().zCard(k.lb(tok.date)), attempts(tok.date, tok.uid)]);
  return { ticks: res.ticks, medal: medalFor(res.ticks, p), par: p, improved, best: best!, sailors, attempts: att };
}

/** Saves a verified run as the sailor's best for the day. */
export async function storeRun(date: string, uid: string, run: Run, route: Array<[number, number]>): Promise<void> {
  await kv().zAdd(k.lb(date), { member: uid, score: run.ticks });
  await kv().hSet(k.runs(date), { [uid]: JSON.stringify(run) });
  await kv().hSet(k.routes(date), { [uid]: JSON.stringify(route) });
  for (const key of [k.lb(date), k.runs(date), k.routes(date)]) await kv().expire(key, KEEP_S * 2);
}

function cleanLivery(l: LiveryDto | null): LiveryDto | null {
  const hex = (s: unknown) => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);
  if (!l || !hex(l.hull) || !hex(l.band) || typeof l.sailNo !== 'string' || !/^[0-9]{1,3}$/.test(l.sailNo)) return null;
  return { hull: l.hull, band: l.band, sailNo: l.sailNo };
}

export async function board(date: string, uid: string | undefined) {
  const p = await par(courseFor(date));
  const top = await kv().zRange(k.lb(date), 0, 9, { by: 'rank' });
  const runs = top.length ? await kv().hMGet(k.runs(date), top.map((m) => m.member)) : [];
  const rows = top.map((m, i) => rowOf(i + 1, runs[i] ? (JSON.parse(runs[i]!) as Run).name : '?', m.score, p, m.member === uid));
  const [me, sailors] = await Promise.all([myBest(date, uid, p), kv().zCard(k.lb(date))]);
  return { rows, me, sailors, par: p };
}

/** Line honours (fastest today), your own best, and up to two sailors just ahead of you. */
export async function ghosts(date: string, uid: string | undefined): Promise<Ghost[]> {
  const n = await kv().zCard(k.lb(date));
  if (!n) return [];
  const picks: Array<{ uid: string; kind: Ghost['kind'] }> = [];
  const first = (await kv().zRange(k.lb(date), 0, 0, { by: 'rank' }))[0];
  if (first && first.member !== uid) picks.push({ uid: first.member, kind: 'top' });
  const myRank = uid ? await kv().zRank(k.lb(date), uid) : undefined;
  if (uid && myRank !== undefined) picks.push({ uid, kind: 'you' });
  const centre = myRank ?? Math.floor(n / 2);
  const near = await kv().zRange(k.lb(date), Math.max(0, centre - 2), Math.max(0, centre - 1), { by: 'rank' });
  for (const m of near) if (!picks.some((x) => x.uid === m.member)) picks.push({ uid: m.member, kind: 'rival' });
  const runs = await kv().hMGet(k.runs(date), picks.map((x) => x.uid));
  const out: Ghost[] = [];
  picks.forEach((x, i) => {
    const r = runs[i];
    if (!r) return;
    const run = JSON.parse(r) as Run;
    out.push({ name: x.kind === 'you' ? 'Your best' : `u/${run.name}`, log: run.log, ticks: run.ticks, livery: run.livery, kind: x.kind });
  });
  return out.slice(0, 4);
}

export async function routes(date: string, uid: string | undefined) {
  const all = await kv().hGetAll(k.routes(date));
  const routesOut: Array<Array<[number, number]>> = [];
  let mine: Array<[number, number]> | null = null;
  for (const [id, r] of Object.entries(all)) {
    const pts = JSON.parse(r) as Array<[number, number]>;
    if (id === uid) mine = pts;
    else if (routesOut.length < 300) routesOut.push(pts);
  }
  return { routes: routesOut, mine };
}

const fmt = (ticks: number) => {
  const t = ticks / TICK_HZ;
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
};
const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
const MEDAL_ICON: Record<Medal, string> = { harbourmaster: '🥇', navigator: '🥈', deckhand: '🥉' };

/** Which way the sailor went on the first beat, from their verified route. */
function sideOf(course: Course, route: Array<[number, number]> | null): string {
  if (!route) return '';
  const m = course.marks[0]!;
  const sx = (course.start.a.x + course.start.b.x) / 2;
  const sy = (course.start.a.y + course.start.b.y) / 2;
  let sum = 0;
  for (const [x, y] of route.slice(1, 10)) sum += (m.x - sx) * (y / 10 - sy) - (m.y - sy) * (x / 10 - sx);
  return sum > 0 ? 'Went left up the first beat.' : 'Went right up the first beat.';
}

export async function share(date: string, image: string | null) {
  const ctx = platform().ctx();
  if (!ctx.userId || !ctx.username || !ctx.postId) throw new ApiErr('login', 'Log in to Reddit to share your race.', 401);
  const p = await par(courseFor(date));
  const best = await myBest(date, ctx.userId, p);
  if (!best) throw new ApiErr('no-run', 'Finish a race first, then share it.', 400);
  if (!(await kv().set(k.shared(date, ctx.userId), '1', { nx: true, expiration: expiry(KEEP_S) }))) throw new ApiErr('shared', 'You already shared today. Come back tomorrow!', 429);
  const [sailors, routeRaw] = await Promise.all([kv().zCard(k.lb(date)), kv().hGet(k.routes(date), ctx.userId)]);
  const course = courseFor(date);
  const side = sideOf(course, routeRaw ? (JSON.parse(routeRaw) as Array<[number, number]>) : null);
  const line = `${fmt(best.ticks)} · ${ordinal(best.rank)} of ${sailors} · ${MEDAL_ICON[best.medal]} ${MEDAL_NAME[best.medal]}`;
  const text = `⛵ Day ${dayNumber(date)} · ${course.name}: ${line}. ${side}`;
  const appText = `⛵ u/${ctx.username} sailed Day ${dayNumber(date)} · ${course.name}: ${line}. ${side}`;
  let imageUrl: string | undefined;
  if (image && image.startsWith('data:image/') && image.length < 3_000_000) {
    try {
      imageUrl = (await platform().media.uploadImage(image)).mediaUrl;
    } catch (e) {
      console.warn('postcard upload failed:', String(e).slice(0, 160));
    }
  }
  try {
    const c = await platform().reddit.submitComment({ postId: ctx.postId, text, caption: text, appCaption: appText, runAsUser: true, ...(imageUrl ? { imageUrl } : {}) });
    return { ok: true as const, commentId: c.id };
  } catch (e) {
    await kv().del(k.shared(date, ctx.userId));
    throw e;
  }
}
